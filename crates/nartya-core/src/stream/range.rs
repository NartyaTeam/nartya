//! Plages d'octets, pour les hébergeurs qui ignorent `Range` et répondent 200.

use bytes::Bytes;
use futures_util::{stream, Stream, StreamExt};

/// Mono-plage : « bytes=100-199 », « bytes=100- », « bytes=-500 ». Bornes inclusives.
pub fn parse_byte_range(header: &str, total: u64) -> Option<(u64, u64)> {
    let spec = header.trim().strip_prefix("bytes=")?;
    let (raw_start, raw_end) = spec.split_once('-')?;
    if total == 0
        || !raw_start.chars().all(|c| c.is_ascii_digit())
        || !raw_end.chars().all(|c| c.is_ascii_digit())
    {
        return None;
    }
    let (start, end) = if raw_start.is_empty() {
        // Les N derniers octets.
        let suffix: u64 = raw_end.parse().ok().filter(|n| *n > 0)?;
        (total.saturating_sub(suffix), total - 1)
    } else {
        let start: u64 = raw_start.parse().ok()?;
        let end = if raw_end.is_empty() {
            total - 1
        } else {
            raw_end.parse::<u64>().ok()?.min(total - 1)
        };
        (start, end)
    };
    (start <= end && start < total).then_some((start, end))
}

/// Découpe un flux complet aux bornes demandées sans le bufferiser : le coût est proportionnel
/// à l'offset.
pub fn slice_stream<S, E>(upstream: S, start: u64, end: u64) -> impl Stream<Item = Result<Bytes, E>>
where
    S: Stream<Item = Result<Bytes, E>> + Unpin,
{
    stream::unfold(
        (upstream, 0u64, false),
        move |(mut up, mut offset, done)| async move {
            if done {
                return None;
            }
            loop {
                match up.next().await {
                    None => return None,
                    Some(Err(e)) => return Some((Err(e), (up, offset, true))),
                    Some(Ok(chunk)) => {
                        let chunk_start = offset;
                        offset += chunk.len() as u64;
                        if offset <= start {
                            continue;
                        }
                        let from = start.saturating_sub(chunk_start) as usize;
                        let to = ((end + 1).saturating_sub(chunk_start) as usize).min(chunk.len());
                        let finished = offset > end;
                        if to > from {
                            return Some((Ok(chunk.slice(from..to)), (up, offset, finished)));
                        }
                        if finished {
                            return None;
                        }
                    }
                }
            }
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analyse_des_plages() {
        assert_eq!(parse_byte_range("bytes=100-199", 1000), Some((100, 199)));
        assert_eq!(parse_byte_range("bytes=100-", 1000), Some((100, 999)));
        assert_eq!(parse_byte_range("bytes=-500", 1000), Some((500, 999)));
        assert_eq!(parse_byte_range("bytes=900-5000", 1000), Some((900, 999)));
        assert_eq!(parse_byte_range("bytes=1000-", 1000), None);
        assert_eq!(parse_byte_range("bytes=200-100", 1000), None);
        assert_eq!(parse_byte_range("bytes=-0", 1000), None);
        assert_eq!(parse_byte_range("bytes=0-1,5-9", 1000), None);
        assert_eq!(parse_byte_range("bytes=0-9", 0), None);
        assert_eq!(parse_byte_range("items=0-9", 100), None);
    }

    #[tokio::test]
    async fn decoupe_sur_plusieurs_morceaux() {
        let data: Vec<u8> = (0..100u8).collect();
        let chunks: Vec<Result<Bytes, ()>> = data
            .chunks(7)
            .map(|c| Ok(Bytes::copy_from_slice(c)))
            .collect();
        let out: Vec<u8> = slice_stream(stream::iter(chunks), 10, 54)
            .map(|r| r.unwrap())
            .collect::<Vec<_>>()
            .await
            .concat();
        assert_eq!(out, data[10..=54].to_vec());
    }

    #[tokio::test]
    async fn decoupe_jusqu_a_la_fin() {
        let chunks: Vec<Result<Bytes, ()>> = vec![Ok(Bytes::from_static(b"0123456789"))];
        let out: Vec<u8> = slice_stream(stream::iter(chunks), 4, 9)
            .map(|r| r.unwrap())
            .collect::<Vec<_>>()
            .await
            .concat();
        assert_eq!(out, b"456789");
    }

    #[tokio::test]
    async fn cesse_de_lire_des_la_plage_complete() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;

        let produced = Arc::new(AtomicUsize::new(0));
        let counter = produced.clone();
        let upstream = stream::iter(0..10usize).map(move |i| {
            counter.fetch_add(1, Ordering::SeqCst);
            Ok::<_, ()>(Bytes::from(vec![i as u8; 100]))
        });
        let out: Vec<u8> = slice_stream(upstream, 0, 149)
            .map(|r| r.unwrap())
            .collect::<Vec<_>>()
            .await
            .concat();
        assert_eq!(out.len(), 150);
        assert_eq!(produced.load(Ordering::SeqCst), 2, "lecture arrêtée au 2e morceau");
    }
}
