/**
 * Anime4K en temps réel via `anime4k-webgpu` (MIT). La <video> décode et porte l'audio mais
 * devient invisible : chaque frame passe par la chaîne puis s'affiche sur un <canvas>.
 * Renderer maison : le `render()` du paquet ne s'arrête jamais et fige la taille d'entrée sur
 * la première frame, alors que l'ABR change de résolution. Le rendu suit les frames vidéo
 * (requestVideoFrameCallback), pas l'écran.
 */

// Modes de l'upstream mpv. `export` = nom de la classe dans le paquet.
const MODES = {
  a: { export: "ModeA", label: "Mode A — sources floues" },
  b: { export: "ModeB", label: "Mode B — sources avec ringing" },
  c: { export: "ModeC", label: "Mode C — sources propres" },
  aa: { export: "ModeAA", label: "Mode A+A — flou marqué" },
  bb: { export: "ModeBB", label: "Mode B+B — ringing marqué" },
  ca: { export: "ModeCA", label: "Mode C+A — propre, plus net" },
};

export const ANIME4K_MODES = Object.entries(MODES).map(([value, m]) => ({
  value,
  label: m.label,
}));

// ~3,4 Mo : chargé au premier usage.
let modulePromise = null;
const loadAnime4k = () => {
  if (!modulePromise) {
    modulePromise = import("anime4k-webgpu").catch((e) => {
      modulePromise = null;
      throw e;
    });
  }
  return modulePromise;
};

export function isAnime4kSupported() {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

const SOFTWARE_GPU_RE = /swiftshader|llvmpipe|software|basic render|lavapipe/i;
const MODEST_GPU_RE = /intel(?:\(r\))? (?:uhd|hd)|iris(?:\(r\))? (?!xe)|geforce mx|radeon vega [3-8]\b/i;
const RECOMMENDED_GPU_RE =
  /geforce (?:rtx|gtx (?:9[7-9]0|1\d{3}|16\d{2}))|radeon (?:rx|pro)|vega (?:56|64)|intel(?:\(r\))? arc|apple m\d/i;

const cleanGpuName = (value) => {
  const cleaned = String(value || "")
    .replace(/^ANGLE \(/i, "")
    .replace(/\)$/, "")
    .replace(/\s+/g, " ")
    .trim();

  // ANGLE renvoie « NVIDIA, NVIDIA GeForce RTX 4060, Direct3D11… » : on garde le modèle.
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  const model = parts.find((part) =>
    /geforce|radeon|intel.*(?:arc|iris|uhd|hd graphics)|apple m\d/i.test(part)
  );
  return (model || cleaned)
    .replace(/\s+(?:direct3d|d3d|metal|opengl|vulkan).*$/i, "")
    .trim();
};

/** Utilisé si WebGPU ne donne que l'architecture. */
function getWebGlRenderer() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { powerPreference: "high-performance" }) ||
      canvas.getContext("webgl", { powerPreference: "high-performance" });
    if (!gl) return "";
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch (_) {
    return "";
  }
}

/** Estimation : WebGPU n'expose pas la VRAM de façon portable. */
export async function assessAnime4kCapability({ mode = "a", sourceWidth = 0, sourceHeight = 0 } = {}) {
  let system = {};
  try {
    system = (await window.electronAPI?.getAnime4kCapabilities?.()) || {};
  } catch (_) {}

  const memoryGb = system.memoryBytes
    ? Math.round((system.memoryBytes / 1024 ** 3) * 10) / 10
    : null;
  const base = {
    gpu: "Carte graphique non identifiée",
    memoryGb,
    cpuCores: system.cpuCores || null,
    webgpu: false,
    sourceWidth,
    sourceHeight,
    outputWidth: sourceWidth ? Math.min(sourceWidth * 2, 3840) : 0,
    outputHeight: sourceHeight ? Math.min(sourceHeight * 2, 2160) : 0,
  };

  if (system.hardwareAccelerationDisabled) {
    return {
      ...base,
      status: "unsupported",
      title: "Activation déconseillée",
      summary: "L'accélération graphique est désactivée sur cette plateforme.",
    };
  }
  if (!isAnime4kSupported()) {
    return {
      ...base,
      status: "unsupported",
      title: "WebGPU indisponible",
      summary: "Ce GPU ou son pilote ne permet pas d'exécuter Anime4K dans Nartya.",
    };
  }

  let adapter = null;
  let adapterInfo = null;
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    adapterInfo = adapter?.info || (await adapter?.requestAdapterInfo?.());
  } catch (_) {}
  if (!adapter) {
    return {
      ...base,
      status: "unsupported",
      title: "Aucun GPU compatible",
      summary: "WebGPU est présent, mais aucun adaptateur haute performance n'est accessible.",
    };
  }

  const activeDevice = system.devices?.find((device) => device.active) || system.devices?.[0];
  const webGlRenderer = getWebGlRenderer();
  const gpu = cleanGpuName(
    adapterInfo?.description ||
      adapterInfo?.device ||
      activeDevice?.deviceString ||
      system.renderer ||
      webGlRenderer ||
      adapterInfo?.architecture ||
      adapterInfo?.vendor
  );
  const descriptor = `${gpu} ${system.renderer || ""} ${webGlRenderer}`;
  const heavyMode = String(mode).length > 1;
  const highInput = sourceHeight >= 1080 || sourceWidth >= 1920;

  let status = "caution";
  let title = "À tester prudemment";
  let summary = "Le GPU est compatible, mais sa marge en temps réel ne peut pas être garantie.";

  if (SOFTWARE_GPU_RE.test(descriptor)) {
    status = "unsupported";
    title = "Activation déconseillée";
    summary = "Un moteur de rendu logiciel a été détecté : Anime4K risque de figer le lecteur.";
  } else if (MODEST_GPU_RE.test(descriptor) || (memoryGb != null && memoryGb < 8)) {
    status = "poor";
    title = "Configuration probablement limitée";
    summary = "Commencez par un modèle simple et une source 720p, ou gardez Anime4K désactivé.";
  } else if (RECOMMENDED_GPU_RE.test(descriptor)) {
    status = heavyMode && highInput ? "caution" : "recommended";
    title = status === "recommended" ? "Configuration adaptée" : "Charge graphique élevée";
    summary =
      status === "recommended"
        ? "Le GPU détecté devrait convenir à l'upscale en temps réel."
        : "Ce GPU paraît adapté, mais ce modèle combiné sur une source 1080p reste exigeant.";
  }

  return {
    ...base,
    gpu: gpu || base.gpu,
    webgpu: true,
    status,
    title,
    summary,
  };
}

// Les presets ne savent que doubler : une cible non multiple de deux finit plus molle que
// la source, et au-delà de ×2 les sous-titres incrustés bavent.
const SCALE = 2;

// Au-delà de la 4K, le coût GPU explose sans gain visible.
const MAX_OUT_W = 3840;
const MAX_OUT_H = 2160;

// Sans frame rendue pendant ce délai en lecture, le rendu est considéré comme bloqué. Large
// devant les 42 ms d'une frame à 24 im/s.
const FRAME_STALL_MS = 600;

const BLIT_WGSL = `
struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn vert_main(@builtin(vertex_index) i : u32) -> VertexOutput {
  const pos = array(
    vec2f( 1.0,  1.0), vec2f( 1.0, -1.0), vec2f(-1.0, -1.0),
    vec2f( 1.0,  1.0), vec2f(-1.0, -1.0), vec2f(-1.0,  1.0),
  );
  const uv = array(
    vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
    vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, 0.0),
  );
  var out : VertexOutput;
  out.position = vec4f(pos[i], 0.0, 1.0);
  out.uv = uv[i];
  return out;
}

@group(0) @binding(0) var texSampler : sampler;
@group(0) @binding(1) var tex : texture_2d<f32>;

@fragment
fn frag_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleBaseClampToEdge(tex, texSampler, uv);
}
`;

// Un seul GPUDevice : en redemander un à chaque bascule de mode fuit.
let devicePromise = null;
function getDevice() {
  if (!devicePromise) {
    devicePromise = (async () => {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) throw new Error("Aucun adaptateur WebGPU");
      // Les limites par défaut (256 Mo par buffer) ne suffisent pas à Anime4K, et les erreurs
      // WebGPU étant asynchrones, l'image passerait au noir sans rien lever.
      const requiredLimits = {};
      for (const k of ["maxBufferSize", "maxStorageBufferBindingSize", "maxTextureDimension2D"]) {
        if (typeof adapter.limits?.[k] === "number") requiredLimits[k] = adapter.limits[k];
      }
      const device = await adapter.requestDevice({ requiredLimits });
      // Reset du pilote, veille : on repartira d'un device neuf.
      device.lost.then(() => { devicePromise = null; });
      return device;
    })().catch((e) => {
      devicePromise = null;
      throw e;
    });
  }
  return devicePromise;
}

/**
 * @param {HTMLVideoElement} video reste la source audio
 * @param {HTMLElement} host conteneur du lecteur
 * @param {string} mode clé de MODES
 * @param {(err: Error) => void} [onError] échec irrécupérable
 * @returns {{ stop: () => void }}
 */
export function startAnime4k(video, host, mode, onError) {
  const preset = MODES[mode] || MODES.a;
  let stopped = false;
  let raf = null;

  // z-index 12 : au-dessus de la vidéo (10) et du poster (11), sous les sous-titres (20).
  // `object-fit: contain` reproduit le letterboxing.
  const canvas = document.createElement("canvas");
  canvas.className = "nartya-anime4k";
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;" +
    "z-index:12;pointer-events:none;background:transparent";
  host.appendChild(canvas);

  let restoreErrorHandler = null;
  let removeSeekHandlers = null;
  let releaseGpuResources = null;
  // Masquée seulement après le premier rendu réussi, pour éviter un noir.
  let videoHidden = false;
  const hideVideo = () => {
    if (videoHidden) return;
    video.style.opacity = "0";
    videoHidden = true;
  };
  const showVideo = () => {
    if (!videoHidden) return;
    video.style.opacity = "";
    videoHidden = false;
  };

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    if (raf != null && video.cancelVideoFrameCallback) {
      try { video.cancelVideoFrameCallback(raf); } catch (_) {}
    }
    removeSeekHandlers?.();
    restoreErrorHandler?.();
    releaseGpuResources?.();
    releaseGpuResources = null;
    delete window.__anime4kDebug;
    canvas.remove();
    showVideo();
  };

  // Défini ici : le gestionnaire d'erreurs WebGPU peut se déclencher avant la fin du corps.
  const fail = (e) => {
    cleanup();
    onError?.(e);
  };

  (async () => {
    let device;
    let PresetCtor;
    try {
      const [mod, dev] = await Promise.all([loadAnime4k(), getDevice()]);
      PresetCtor = mod[preset.export];
      device = dev;
      if (!PresetCtor) throw new Error(`Mode Anime4K inconnu : ${preset.export}`);
    } catch (e) {
      cleanup();
      onError?.(e);
      return;
    }
    if (stopped) return;

    // Une erreur WebGPU non capturée invalide les ressources sans rien interrompre : on coupe
    // l'effet plutôt que de laisser un canvas noir.
    const previousErrorHandler = device.onuncapturederror;
    device.onuncapturederror = (event) => {
      previousErrorHandler?.call?.(device, event);
      if (stopped) return;
      fail(new Error(`WebGPU: ${event.error?.message || "erreur inconnue"}`));
    };
    restoreErrorHandler = () => { device.onuncapturederror = previousErrorHandler; };

    // `device.lost` n'émet pas forcément `uncapturederror`.
    device.lost.then((info) => {
      if (stopped) return;
      const detail = info?.message || info?.reason || "périphérique graphique perdu";
      fail(new Error(`WebGPU: ${detail}`));
    });

    if (!video.videoWidth) {
      await new Promise((resolve) => {
        const done = () => resolve();
        video.addEventListener("loadeddata", done, { once: true });
        video.addEventListener("resize", done, { once: true });
      });
    }
    if (stopped || !video.videoWidth) return;

    const context = canvas.getContext("webgpu");
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });
    const shader = device.createShaderModule({ code: BLIT_WGSL });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
    const blitPipeline = device.createRenderPipeline({
      layout,
      vertex: { module: shader, entryPoint: "vert_main" },
      fragment: { module: shader, entryPoint: "frag_main", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    // Ramène la frame à la résolution de référence de la chaîne.
    const normalizePipeline = device.createRenderPipeline({
      layout,
      vertex: { module: shader, entryPoint: "vert_main" },
      fragment: { module: shader, entryPoint: "frag_main", targets: [{ format: "rgba16float" }] },
      primitive: { topology: "triangle-list" },
    });
    const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

    // `baseW×baseH` : référence de la chaîne. `srcW×srcH` : frame présentée, qui suit l'ABR.
    let sourceTexture = null;
    let inputTexture = null;
    let normalizeBindGroup = null;
    let pipelines = [];
    let bindGroup = null;
    let srcW = 0;
    let srcH = 0;
    let baseW = 0;
    let baseH = 0;
    let targetW = 0;
    let targetH = 0;

    // Le natif doublé, indépendamment de la taille d'affichage : le compositeur fait le reste.
    const computeTarget = () => {
      const fits = baseW * SCALE <= MAX_OUT_W && baseH * SCALE <= MAX_OUT_H;
      const scale = fits ? SCALE : 1;
      return { width: baseW * scale, height: baseH * scale };
    };

    // Les presets n'exposent pas de `destroy()`.
    const destroyPipelines = (list) => {
      if (!Array.isArray(list)) return;
      list.forEach((p) => {
        try { p.outputTexture?.destroy?.(); } catch (_) {}
        destroyPipelines(p?.pipelines);
      });
    };

    // Attendre le GC peut épuiser la mémoire vidéo sur une longue session.
    releaseGpuResources = () => {
      destroyPipelines(pipelines);
      pipelines = [];
      try { sourceTexture?.destroy?.(); } catch (_) {}
      try { inputTexture?.destroy?.(); } catch (_) {}
      sourceTexture = null;
      inputTexture = null;
      normalizeBindGroup = null;
      bindGroup = null;
      try { context.unconfigure?.(); } catch (_) {}
    };

    const setSource = (w, h) => {
      srcW = w;
      srcH = h;
      sourceTexture?.destroy?.();
      sourceTexture = device.createTexture({
        size: [srcW, srcH, 1],
        format: "rgba16float",
        // Exigé par `copyExternalImageToTexture` sur sa destination, même sans y dessiner.
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      normalizeBindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: sourceTexture.createView() },
        ],
      });
    };

    // Coûteux : au démarrage, ou si la source dépasse la référence.
    const build = (w, h) => {
      baseW = w;
      baseH = h;
      const target = computeTarget();
      targetW = target.width;
      targetH = target.height;

      destroyPipelines(pipelines);
      pipelines = [];
      inputTexture?.destroy?.();
      inputTexture = device.createTexture({
        size: [baseW, baseH, 1],
        format: "rgba16float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      pipelines = [
        new PresetCtor({
          device,
          inputTexture,
          nativeDimensions: { width: baseW, height: baseH },
          targetDimensions: { width: targetW, height: targetH },
        }),
      ];

      const outputTexture = pipelines[pipelines.length - 1].getOutputTexture();
      canvas.width = outputTexture.width;
      canvas.height = outputTexture.height;
      bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: outputTexture.createView() },
        ],
      });
    };

    // Hors de la boucle, pour repeindre une vidéo en pause après une reconstruction.
    const renderOnce = () => {
      device.queue.copyExternalImageToTexture(
        { source: video },
        { texture: sourceTexture },
        [srcW, srcH]
      );
      const encoder = device.createCommandEncoder();

      const normalizePass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: inputTexture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      normalizePass.setPipeline(normalizePipeline);
      normalizePass.setBindGroup(0, normalizeBindGroup);
      normalizePass.draw(6);
      normalizePass.end();

      pipelines.forEach((p) => p.pass(encoder));
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(blitPipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
      pass.end();
      device.queue.submit([encoder.finish()]);
      canvas.style.opacity = "1";
      hideVideo();
    };

    try {
      setSource(video.videoWidth, video.videoHeight);
      build(video.videoWidth, video.videoHeight);
    } catch (e) {
      fail(e);
      return;
    }

    let lastFrameAt = performance.now();

    const frame = (_now, metadata) => {
      if (stopped) return;
      raf = null;
      lastFrameAt = performance.now();
      try {
        // `video.videoWidth` est en retard de quelques frames sur un changement de variante.
        const fw = metadata?.width || video.videoWidth;
        const fh = metadata?.height || video.videoHeight;
        if (fw && fh && (fw !== srcW || fh !== srcH)) {
          setSource(fw, fh);
          // La référence ne fait que monter : une redescente ABR est absorbée par la normalisation.
          if (fw > baseW || fh > baseH) build(Math.max(fw, baseW), Math.max(fh, baseH));
        }
        renderOnce();
      } catch (e) {
        // SecurityError si la vidéo est « tainted » (cross-origin sans CORS) : irrécupérable.
        fail(e);
        return;
      }
      armFrame();
    };

    const cancelFrame = () => {
      if (raf == null || !video.cancelVideoFrameCallback) return;
      try { video.cancelVideoFrameCallback(raf); } catch (_) {}
      raf = null;
    };
    const armFrame = () => {
      if (stopped || raf != null) return;
      raf = video.requestVideoFrameCallback(frame);
    };

    // Un seek lointain peut faire abandonner le callback en attente : on le réarme, vidéo
    // native visible pendant le seek.
    const onSeeking = () => {
      cancelFrame();
      canvas.style.opacity = "0";
      showVideo();
    };
    const onSeeked = () => {
      lastFrameAt = performance.now();
      armFrame();
    };
    const onPlaying = () => {
      lastFrameAt = performance.now();
    };
    // Sur un seek arrière, Chromium perd parfois le callback : si la lecture progresse sans
    // frame rendue, on repasse sur la vidéo native et on réarme.
    const onTimeUpdate = () => {
      if (video.paused || video.seeking) return;
      if (performance.now() - lastFrameAt < FRAME_STALL_MS) return;
      cancelFrame();
      canvas.style.opacity = "0";
      showVideo();
      lastFrameAt = performance.now();
      armFrame();
    };
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("timeupdate", onTimeUpdate);
    removeSeekHandlers = () => {
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("timeupdate", onTimeUpdate);
    };

    armFrame();

    // Le `renderOnce()` est nécessaire : un canvas WebGPU déjà présenté se relit vide.
    window.__anime4kDebug = () => {
      try { renderOnce(); } catch (_) {}
      const probe = document.createElement("canvas");
      probe.width = 64;
      probe.height = 64;
      const c2 = probe.getContext("2d");
      c2.drawImage(canvas, 0, 0, 64, 64);
      const d = c2.getImageData(0, 0, 64, 64).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 24) lit++;
      return {
        canvas: `${canvas.width}×${canvas.height}`,
        source: `${srcW}×${srcH}`,
        reference: `${baseW}×${baseH}`,
        cible: `${targetW}×${targetH}`,
        facteur: baseW ? `×${(targetW / baseW).toFixed(2)}` : "—",
        pixelsAllumes: `${Math.round((lit / 4096) * 100)}%`,
        canvasDansLePleinEcran: document.fullscreenElement?.contains(canvas) ?? "hors plein écran",
        rectCanvas: canvas.getBoundingClientRect().toJSON(),
      };
    };
  })();

  return { stop: cleanup };
}
