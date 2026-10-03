/**
 * Le <video> natif n'a pas le buffer de hls.js : la file découple la lecture du CDN de
 * l'écriture vers le lecteur et absorbe la gigue. Un client qui coupe (seek) détruit l'upstream.
 */
export function pipeWithReadAhead(upstream, res, maxAheadBytes) {
  return new Promise((resolve, reject) => {
    const queue = [];
    let queuedBytes = 0;
    let ended = false;
    let prodError = null;
    let aborted = false;
    let wakeProducer = null;
    let wakeConsumer = null;

    const signalConsumer = () => { if (wakeConsumer) { const f = wakeConsumer; wakeConsumer = null; f(); } };
    const signalProducer = () => { if (wakeProducer) { const f = wakeProducer; wakeProducer = null; f(); } };

    const abort = () => {
      if (aborted) return;
      aborted = true;
      try { upstream.destroy(); } catch (_) {}
      signalProducer();
      signalConsumer();
    };

    // Typiquement un seek.
    res.on("close", () => { if (!ended || queue.length > 0) abort(); });

    // Producteur
    (async () => {
      try {
        for await (const chunk of upstream) {
          if (aborted) return;
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          queue.push(buf);
          queuedBytes += buf.length;
          signalConsumer();
          while (queuedBytes >= maxAheadBytes && !aborted) {
            await new Promise((r) => { wakeProducer = r; });
          }
        }
      } catch (err) {
        if (!aborted) prodError = err;
      } finally {
        ended = true;
        signalConsumer();
      }
    })();

    // Consommateur
    (async () => {
      try {
        while (true) {
          if (aborted) { resolve(); return; }
          if (queue.length === 0) {
            if (ended) break;
            await new Promise((r) => { wakeConsumer = r; });
            continue;
          }
          const buf = queue.shift();
          queuedBytes -= buf.length;
          if (queuedBytes < maxAheadBytes) signalProducer();
          if (!res.write(buf)) {
            // Sans rester bloqué si le client coupe.
            await new Promise((r) => {
              const onDrain = () => { res.removeListener("close", onClose); r(); };
              const onClose = () => { res.removeListener("drain", onDrain); r(); };
              res.once("drain", onDrain);
              res.once("close", onClose);
            });
          }
        }
        if (prodError) { reject(prodError); return; }
        res.end();
        resolve();
      } catch (err) {
        abort();
        reject(err);
      }
    })();
  });
}
