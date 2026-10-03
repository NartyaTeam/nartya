/**
 * App Electron déjà lancée avec --remote-debugging-port=9222 : navigue dans la vraie UI et
 * inspecte le <video> après résolution.
 */
const CDP_HTTP = process.env.NARTYA_CDP_URL || "http://127.0.0.1:9222";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function connectCdp() {
  const targets = await (await fetch(`${CDP_HTTP}/json`)).json();
  const target = targets.find(
    (item) => item.type === "page" && /127\.0\.0\.1:5173|localhost:5173/.test(item.url)
  );
  assert(target?.webSocketDebuggerUrl, "fenêtre Nartya introuvable dans CDP");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let sequence = 0;
  const pending = new Map();
  const networkRequests = [];
  const networkResponses = [];
  const networkFailures = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Network.requestWillBeSent" && message.params?.request?.url) {
      networkRequests.push(message.params.request.url);
    }
    if (message.method === "Network.responseReceived" && message.params?.response?.url) {
      networkResponses.push({
        url: message.params.response.url,
        status: message.params.response.status,
      });
    }
    if (message.method === "Network.loadingFailed") {
      networkFailures.push(message.params?.errorText || "échec réseau");
    }
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  return { ws, send, networkRequests, networkResponses, networkFailures };
}

const { ws, send, networkRequests, networkResponses, networkFailures } = await connectCdp();
await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");

async function inspectEpisode({ slug, label, expectProvider }) {
  const url =
    `http://127.0.0.1:5173/#/watch/${slug}` +
    `?season=saison1&ep=1&lang=vostfr&src=auto&smoke=${Date.now()}`;
  await send("Page.navigate", { url: "http://127.0.0.1:5173/#/" });
  await new Promise((resolve) => setTimeout(resolve, 500));
  networkRequests.length = 0;
  networkResponses.length = 0;
  networkFailures.length = 0;
  await send("Page.navigate", { url });

  let state = null;
  for (let attempt = 0; attempt < 75; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const evaluated = await send("Runtime.evaluate", {
      expression: `(() => {
        const video = document.querySelector("video");
        const body = document.body?.innerText || "";
        return {
          href: location.href,
          hasUnsupported: /Aucune source supportée/i.test(body),
          hasUnavailable: /Aucune source disponible/i.test(body),
          bodyPreview: body.slice(0, 600),
          proxyRequests: performance.getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((name) => /127\\.0\\.0\\.1:\\d+\\/video\\/proxy/.test(name))
            .slice(-20),
          video: video ? {
            currentSrc: video.currentSrc || video.src || "",
            readyState: video.readyState,
            networkState: video.networkState,
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
            error: video.error ? { code: video.error.code, message: video.error.message } : null
          } : null
        };
      })()`,
      returnByValue: true,
    });
    state = evaluated.result?.value;
    if (state?.video?.readyState >= 2 || state?.video?.error || state?.hasUnsupported) break;
  }

  assert(state && !state.hasUnsupported, `${label}: « Aucune source supportée » est encore affiché`);
  assert(state && !state.hasUnavailable, `${label}: aucune source n'a abouti`);
  const proxyStatuses = networkResponses
    .filter((entry) => /127\.0\.0\.1:\d+\/video\/proxy/.test(entry.url))
    .map((entry) => entry.status);
  const diagnostics =
    `proxy=${proxyStatuses.join(",") || "aucun"}; ` +
    `échecs=${networkFailures.slice(-5).join(",") || "aucun"}`;

  assert(state?.video, `${label}: lecteur vidéo absent — ${state?.bodyPreview || ""} (${diagnostics})`);
  assert(!state.video.error, `${label}: erreur vidéo ${JSON.stringify(state.video.error)}`);
  assert(
    state.video.readyState >= 2,
    `${label}: vidéo non chargée (readyState=${state.video.readyState}; ${diagnostics}; ` +
      `UI=${state.bodyPreview})`
  );
  assert(
    state.proxyRequests?.length > 0 ||
      networkRequests.some((requestUrl) => /127\.0\.0\.1:\d+\/video\/proxy/.test(requestUrl)),
    `${label}: aucune requête observée vers le proxy local (src=${state.video.currentSrc})`
  );
  assert(
    new RegExp(expectProvider, "i").test(state.bodyPreview) || state.video.width > 0,
    `${label}: provider/vidéo non observable`
  );

  console.log(
    `✅ UI Electron : ${label} — ${state.video.width}x${state.video.height}, ` +
      `readyState=${state.video.readyState}, proxy local actif`
  );
}

try {
  if (process.env.NARTYA_SMOKE_ONLY !== "gachiakuta") {
    await inspectEpisode({
      slug: "hunter-x-hunter",
      label: "Hunter x Hunter 2011 épisode 1 VOSTFR",
      expectProvider: "Ansembed|Smoothpre",
    });
  }
  if (process.env.NARTYA_SMOKE_ONLY !== "hunter-x-hunter") {
    await inspectEpisode({
      slug: "gachiakuta",
      label: "Gachiakuta épisode 1 VOSTFR",
      expectProvider: "Movearn",
    });
  }
} finally {
  ws.close();
}
