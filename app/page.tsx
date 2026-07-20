"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { GIFEncoder, applyPalette, quantize } from "gifenc";

type Motion = "rotate" | "translate" | "fade" | "scale" | "bounce" | "draw";
type Preset = "rotate" | "fade" | "flyback" | "heartbeat" | "firework" | "sway" | "liquid" | "jump" | "fadeSequence" | "swayX" | "swayY" | "bell" | "drawForward" | "drawReverse";
type Anim = { motion: Motion; preset?: Preset; duration: number; delay: number; easing: string; iterations: string; distance: number; angle: number; direction: "normal" | "reverse" | "alternate"; dx?: number; dy?: number; origin?: string };
type Layer = { id: string; label: string; tag: string };

const demoSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.9502 3.99817C17.5413 3.99818 18.1268 4.11467 18.6729 4.34094C19.2188 4.56718 19.715 4.89858 20.1328 5.31653V5.3175C20.5509 5.7354 20.8831 6.23136 21.1094 6.77747C21.3356 7.32354 21.4521 7.90903 21.4521 8.50012C21.4521 9.0912 21.3356 9.67671 21.1094 10.2228C20.8831 10.7688 20.5509 11.2649 20.1328 11.6827L20.127 11.6896L12 19.963L3.87402 11.6896L3.86719 11.6827C3.02312 10.8386 2.54886 9.69385 2.54883 8.50012C2.54883 7.30641 3.02317 6.16164 3.86719 5.3175C4.71127 4.47342 5.8561 3.99923 7.0498 3.99915C8.24362 3.99915 9.38924 4.47335 10.2334 5.3175L11.293 6.37708C11.6835 6.76757 12.3165 6.76752 12.707 6.37708L13.7676 5.3175V5.31653C14.1854 4.89859 14.6816 4.56717 15.2275 4.34094C15.7736 4.11466 16.3591 3.99817 16.9502 3.99817Z" stroke="#7C828E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const defaults: Anim = { motion: "rotate", duration: 1.4, delay: 0, easing: "cubic-bezier(.45,0,.2,1)", iterations: "infinite", distance: 24, angle: 360, direction: "normal" };
const easingOptions = [
  ["Плавно", "cubic-bezier(.45,0,.2,1)"], ["Ускорение", "cubic-bezier(.4,0,1,1)"],
  ["Замедление", "cubic-bezier(0,0,.2,1)"], ["Мягкая пружина", "cubic-bezier(.34,1.56,.64,1)"],
  ["Ровно", "linear"],
];
const presets: { id: Preset; icon: string; name: string; note: string }[] = [
  { id: "rotate", icon: "↻", name: "Поворот", note: "Вращение вокруг центра" },
  { id: "fade", icon: "◐", name: "Исчезновение", note: "Плавное появление и скрытие" },
  { id: "flyback", icon: "⇢", name: "Вылет и возврат", note: "Стоп · вылет назад" },
  { id: "heartbeat", icon: "♥", name: "Биение сердца", note: "Двойной пульс" },
  { id: "firework", icon: "✦", name: "Фейерверк", note: "Из центра наружу" },
  { id: "sway", icon: "≈", name: "Покачивание", note: "Мягко из стороны в сторону" },
  { id: "liquid", icon: "◒", name: "Жидкая заливка", note: "Подъём снизу" },
  { id: "jump", icon: "↟", name: "Подпрыгивание", note: "Ритмично вверх и вниз" },
  { id: "fadeSequence", icon: "◌", name: "Поочерёдное появление", note: "Каждый элемент отдельно" },
  { id: "swayY", icon: "↕", name: "Покачивание вверх-вниз", note: "Мягкая вертикальная петля" },
  { id: "swayX", icon: "↔", name: "Покачивание вправо-влево", note: "Мягкая горизонтальная петля" },
  { id: "bell", icon: "♧", name: "Колокольчик", note: "Вращение от точки подвеса" },
  { id: "drawForward", icon: "↝", name: "Линия: вперёд", note: "От начала к концу" },
  { id: "drawReverse", icon: "↜", name: "Линия: назад", note: "От конца к началу" },
];

const alphaBayer8 = [
  0,48,12,60,3,51,15,63, 32,16,44,28,35,19,47,31,
  8,56,4,52,11,59,7,55, 40,24,36,20,43,27,39,23,
  2,50,14,62,1,49,13,61, 34,18,46,30,33,17,45,29,
  10,58,6,54,9,57,5,53, 42,26,38,22,41,25,37,21,
];

function ditherGifAlpha(rgba: Uint8ClampedArray, width: number) {
  for (let pixel = 0; pixel < rgba.length / 4; pixel++) {
    const alphaIndex = pixel * 4 + 3; const alpha = rgba[alphaIndex];
    if (alpha <= 32) { rgba[alphaIndex] = 0; continue; }
    if (alpha >= 232) { rgba[alphaIndex] = 255; continue; }
    const x = pixel % width, y = Math.floor(pixel / width);
    const normalizedAlpha = (alpha - 32) * 255 / 200;
    rgba[alphaIndex] = normalizedAlpha >= (alphaBayer8[(y % 8) * 8 + (x % 8)] + .5) * 4 ? 255 : 0;
  }
}

function prepareSvg(raw: string) {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.tagName.toLowerCase() !== "svg") throw new Error("Это невалидный SVG-файл");
  doc.querySelectorAll("script,foreignObject,iframe").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((a) => { if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) node.removeAttribute(a.name); });
  });
  const svg = doc.documentElement;
  const originalWidth = svg.getAttribute("width"); const originalHeight = svg.getAttribute("height");
  if (!svg.getAttribute("viewBox")) {
    const w = parseFloat(svg.getAttribute("width") || "240"), h = parseFloat(svg.getAttribute("height") || "240");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }
  const viewBox = (svg.getAttribute("viewBox") || "0 0 240 240").trim().split(/[ ,]+/).map(Number); const viewWidth = Math.abs(viewBox[2]) || 240, viewHeight = Math.abs(viewBox[3]) || 240;
  const numericWidth = originalWidth && !originalWidth.includes("%") ? parseFloat(originalWidth) : NaN; const numericHeight = originalHeight && !originalHeight.includes("%") ? parseFloat(originalHeight) : NaN;
  const exportWidth = Number.isFinite(numericWidth) && numericWidth > 0 ? numericWidth : Number.isFinite(numericHeight) && numericHeight > 0 ? numericHeight * viewWidth / viewHeight : viewWidth;
  const exportHeight = Number.isFinite(numericHeight) && numericHeight > 0 ? numericHeight : exportWidth * viewHeight / viewWidth;
  svg.setAttribute("data-export-width", String(exportWidth)); svg.setAttribute("data-export-height", String(exportHeight));
  svg.removeAttribute("width"); svg.removeAttribute("height");
  const candidates = [...svg.children].filter((n) => !["defs", "style", "title", "desc"].includes(n.tagName.toLowerCase()));
  const layers: Layer[] = candidates.map((node, i) => {
    const id = `motion-layer-${i + 1}`; node.setAttribute("data-motion-id", id);
    return { id, tag: node.tagName.toLowerCase(), label: node.getAttribute("id") || node.getAttribute("aria-label") || `${node.tagName} ${i + 1}` };
  });
  return { svg: new XMLSerializer().serializeToString(svg), layers };
}

function keyframes(a: Anim) {
  if (a.preset === "rotate") return `0%{transform:rotate(0deg)}100%{transform:rotate(${a.angle}deg)}}`;
  if (a.preset === "fade") return `0%,100%{opacity:1}50%{opacity:0}}`;
  if (a.preset === "flyback") return `0%{transform:translateX(-${a.distance * 1.4}px);opacity:0}22%{transform:translateX(0);opacity:1}52%{transform:translateX(0);opacity:1}78%,100%{transform:translateX(${a.distance * 1.4}px);opacity:0}}`;
  if (a.preset === "heartbeat") return `0%,28%,100%{transform:scale(1)}10%{transform:scale(1.16)}18%{transform:scale(.96)}24%{transform:scale(1.1)}}`;
  if (a.preset === "firework") return `0%,100%{transform:scale(1)}12%{transform:scale(.92)}28%{transform:scale(1.08)}45%{transform:scale(1)}}`;
  if (a.preset === "sway") return `0%,100%{transform:rotate(-${a.angle / 2}deg)}50%{transform:rotate(${a.angle / 2}deg)}}`;
  if (a.preset === "liquid") return `0%{transform:translateY(${a.distance * 2.4}px) scaleY(.12);opacity:0}18%{opacity:.45}72%{transform:translateY(-3px) scaleY(1.04);opacity:1}88%,100%{transform:translateY(0) scaleY(1);opacity:1}}`;
  if (a.preset === "jump") return `0%,100%{transform:translateY(0)}38%{transform:translateY(-${a.distance}px)}55%{transform:translateY(3px) scaleY(.94)}68%{transform:translateY(-${a.distance * .28}px)}82%{transform:translateY(0)}}`;
  if (a.preset === "fadeSequence") return `0%,15%{opacity:0;transform:scale(.88)}38%,68%{opacity:1;transform:scale(1)}92%,100%{opacity:0;transform:scale(.96)}}`;
  if (a.preset === "swayY") return `0%,100%{transform:translateY(-${a.distance}px)}50%{transform:translateY(${a.distance}px)}}`;
  if (a.preset === "swayX") return `0%,100%{transform:translateX(-${a.distance}px)}50%{transform:translateX(${a.distance}px)}}`;
  if (a.preset === "bell") return `0%,100%{transform:rotate(-${Math.max(4, a.angle / 20)}deg)}50%{transform:rotate(${Math.max(4, a.angle / 20)}deg)}}`;
  if (a.preset === "drawForward") return `0%{stroke-dashoffset:100}100%{stroke-dashoffset:0}}`;
  if (a.preset === "drawReverse") return `0%{stroke-dashoffset:-100}100%{stroke-dashoffset:0}}`;
  const d = a.distance, angle = a.angle;
  if (a.motion === "rotate") return `0%{transform:rotate(0deg)}100%{transform:rotate(${angle}deg)}}`;
  if (a.motion === "translate") return `0%,100%{transform:translateX(0)}50%{transform:translateX(${d}px)}}`;
  if (a.motion === "fade") return `0%,100%{opacity:1}50%{opacity:0}}`;
  if (a.motion === "scale") return `0%,100%{transform:scale(1)}50%{transform:scale(${Math.max(.05, d / 20).toFixed(2)})}}`;
  if (a.motion === "bounce") return `0%,100%{transform:translateY(0)}45%{transform:translateY(-${d}px)}65%{transform:translateY(${Math.round(d * .18)}px)}}`;
  return `0%{stroke-dashoffset:220}100%{stroke-dashoffset:0}}`;
}

function buildAnimated(svgText: string, animations: Record<string, Anim>, playing = true, seekSeconds?: number) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  doc.querySelector("style[data-motion-styles]")?.remove();
  doc.querySelector("[data-motion-particles]")?.remove();
  const rules: string[] = [];
  Object.entries(animations).forEach(([id, a], i) => {
    const name = `iconMotion${i}`;
    rules.push(`@keyframes ${name}{${keyframes(a)}`);
    const isDraw = a.motion === "draw" || a.preset === "drawForward" || a.preset === "drawReverse";
    if (isDraw) doc.querySelector(`[data-motion-id="${id}"]`)?.querySelectorAll("path,line,polyline,polygon,circle,rect").forEach(el => el.setAttribute("pathLength", "100"));
    const target = isDraw ? `[data-motion-id="${id}"],[data-motion-id="${id}"] path,[data-motion-id="${id}"] line,[data-motion-id="${id}"] polyline,[data-motion-id="${id}"] polygon,[data-motion-id="${id}"] circle,[data-motion-id="${id}"] rect` : `[data-motion-id="${id}"]`;
    const draw = isDraw ? "stroke-dasharray:100;" : "";
    const delay = seekSeconds === undefined ? a.delay : a.delay - seekSeconds;
    rules.push(`${target}{${draw}transform-box:fill-box;transform-origin:${a.origin || "center"};animation:${name} ${a.duration}s ${a.easing} ${delay}s ${a.iterations} ${a.direction};animation-play-state:${seekSeconds === undefined && playing ? "running" : "paused"};animation-fill-mode:both}`);
  });
  const firework = Object.values(animations).find(a => a.preset === "firework");
  if (firework) {
    const svg = doc.documentElement; const viewBox = (svg.getAttribute("viewBox") || "0 0 240 240").split(/\s+/).map(Number);
    const cx = viewBox[0] + viewBox[2] / 2, cy = viewBox[1] + viewBox[3] / 2;
    const group = doc.createElementNS("http://www.w3.org/2000/svg", "g"); group.setAttribute("data-motion-particles", "true"); group.setAttribute("pointer-events", "none");
    Array.from({ length: 20 }).forEach((_, i) => {
      const line = doc.createElementNS("http://www.w3.org/2000/svg", "line"); const angle = i * 18 + (i % 2) * 5; const radius = 52 + (i % 4) * 12;
      line.setAttribute("x1", String(cx)); line.setAttribute("y1", String(cy - 3)); line.setAttribute("x2", String(cx)); line.setAttribute("y2", String(cy + 5 + (i % 3) * 2)); line.setAttribute("stroke", i % 3 === 0 ? "#ffffff" : "#d8ff3e"); line.setAttribute("stroke-width", i % 2 ? "2" : "3"); line.setAttribute("stroke-linecap", "round"); line.setAttribute("data-particle", String(i)); group.appendChild(line);
      const pn = `particleBurst${i}`; rules.push(`@keyframes ${pn}{0%,8%{transform:rotate(${angle}deg) translateY(0) scaleY(.15);opacity:0}20%{opacity:1}68%{transform:rotate(${angle}deg) translateY(-${radius}px) scaleY(1);opacity:1}100%{transform:rotate(${angle}deg) translateY(-${radius * 1.3}px) scaleY(.35);opacity:0}}`);
      const particleDelay = i * .018 - (seekSeconds || 0);
      rules.push(`[data-particle="${i}"]{transform-origin:${cx}px ${cy}px;animation:${pn} ${firework.duration}s ${firework.easing} ${particleDelay}s ${firework.iterations};animation-play-state:${seekSeconds === undefined && playing ? "running" : "paused"};animation-fill-mode:both}`);
    });
    svg.appendChild(group);
  }
  const style = doc.createElementNS("http://www.w3.org/2000/svg", "style"); style.setAttribute("data-motion-styles", "true"); style.textContent = rules.join("\n");
  doc.documentElement.insertBefore(style, doc.documentElement.firstChild);
  return new XMLSerializer().serializeToString(doc.documentElement);
}

export default function Home() {
  const [svgText, setSvgText] = useState(""); const [layers, setLayers] = useState<Layer[]>([]);
  const [selected, setSelected] = useState<string[]>([]); const [animations, setAnimations] = useState<Record<string, Anim>>({});
  const [settings, setSettings] = useState<Anim>(defaults); const [playing, setPlaying] = useState(true);
  const [sceneBackground, setSceneBackground] = useState<"light" | "dark">("light");
  const [dragging, setDragging] = useState(false); const [error, setError] = useState(""); const [fileName, setFileName] = useState("icon");
  const [gifProgress, setGifProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (raw: string, name = "icon") => { try { const parsed = prepareSvg(raw); setSvgText(parsed.svg); setLayers(parsed.layers); setSelected(parsed.layers[0] ? [parsed.layers[0].id] : ["__root"]); setAnimations({}); setFileName(name.replace(/\.svg$/i, "")); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось прочитать SVG"); } };
  useEffect(() => { load(demoSvg, "orbit-star"); }, []);
  const targets = selected.length ? selected : ["__root"];
  const effectiveAnimations = useMemo(() => { const result = { ...animations }; if (result.__root) { const { __root, ...rest } = result; return Object.fromEntries(layers.map(l => [l.id, rest[l.id] || __root])); } return result; }, [animations, layers]);
  const preview = useMemo(() => svgText ? buildAnimated(svgText, effectiveAnimations, playing) : "", [svgText, effectiveAnimations, playing]);
  const distancePresets: Preset[] = ["flyback", "liquid", "jump", "swayX", "swayY"];

  const restartPreview = () => { setPlaying(false); setTimeout(() => setPlaying(true), 30); };
  const choose = (id: string, additive: boolean) => { setSelected(prev => additive ? (prev.includes(id) ? prev.filter(x => x !== id) : [...prev.filter(x => x !== "__root"), id]) : [id]); const a = id === "__root" ? Object.values(animations)[0] : animations[id]; setSettings(a || defaults); };
  const updateAnimation = (patch: Partial<Anim>) => {
    const updated = { ...settings, ...patch }; setSettings(updated);
    setAnimations(prev => { const next = { ...prev }; const isRoot = targets.includes("__root"); const ids = isRoot ? Object.keys(next) : targets; const delayDelta = patch.delay === undefined ? 0 : patch.delay - settings.delay; ids.forEach(id => { if (next[id]) next[id] = { ...next[id], ...patch, ...(isRoot && patch.delay !== undefined ? { delay: Math.max(0, next[id].delay + delayDelta) } : {}) }; }); return next; }); restartPreview();
  };
  const applyPreset = (preset: Preset) => {
    const recipe: Record<Preset, Partial<Anim>> = {
      rotate: { motion: "rotate", duration: 1.8, easing: "linear", angle: 360, iterations: "infinite" },
      fade: { motion: "fade", duration: 1.8, easing: "ease-in-out", iterations: "infinite" },
      flyback: { duration: 2.4, easing: "cubic-bezier(.65,0,.35,1)", distance: 42 },
      heartbeat: { duration: 1.35, easing: "cubic-bezier(.22,.8,.3,1)", distance: 18 },
      firework: { duration: 2.2, easing: "cubic-bezier(.18,.75,.25,1)", distance: 72 },
      sway: { duration: 2.8, easing: "ease-in-out", angle: 10 },
      liquid: { duration: 2.6, easing: "cubic-bezier(.2,.75,.3,1)", distance: 48, iterations: "1" },
      jump: { duration: 1.3, easing: "cubic-bezier(.3,.8,.35,1)", distance: 22 },
      fadeSequence: { duration: 2.6, easing: "ease-in-out", iterations: "infinite" },
      swayX: { duration: 2.4, easing: "ease-in-out", distance: 7 },
      swayY: { duration: 2.4, easing: "ease-in-out", distance: 7 },
      bell: { duration: 1.8, easing: "ease-in-out", angle: 160, origin: "50% 0%" },
      drawForward: { duration: 2.2, easing: "ease-in-out", iterations: "1", motion: "draw" },
      drawReverse: { duration: 2.2, easing: "ease-in-out", iterations: "1", motion: "draw" },
    };
    const base = { ...defaults, ...recipe[preset], preset };
    const count = Math.max(layers.length, 1);
    setAnimations(prev => { const next: Record<string, Anim> = targets.includes("__root") ? {} : { ...prev }; const targetLayers = targets.includes("__root") ? layers : layers.filter(layer => targets.includes(layer.id)); targetLayers.forEach((layer) => {
      const i = layers.findIndex(item => item.id === layer.id);
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / count;
      const radius = 48 + (i % 3) * 16;
      const stagger = preset === "fadeSequence" ? i * .22 : preset === "liquid" ? i * .035 : 0;
      next[layer.id] = { ...base, delay: stagger, dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius };
    }); return next; });
    setSettings(base); restartPreview();
  };
  const readFile = (file?: File) => { if (!file) return; if (!file.name.toLowerCase().endsWith(".svg") && file.type !== "image/svg+xml") { setError("Выберите файл в формате .svg"); return; } const r = new FileReader(); r.onload = () => load(String(r.result), file.name); r.readAsText(file); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files[0]); };
  const download = () => { const output = buildAnimated(svgText, effectiveAnimations, true); const blob = new Blob([output], { type: "image/svg+xml" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${fileName}-animated.svg`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500); };
  const downloadGif = async () => {
    if (!svgText || gifProgress !== null) return;
    setGifProgress(0); setError("");
    try {
      const width = 400, height = 400, inset = 64, artworkSize = 272, fps = 50;
      const duration = Math.min(6, Math.max(1, ...Object.values(effectiveAnimations).map(a => a.duration + a.delay)));
      const frames = Math.max(1, Math.round(duration * fps)); const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) throw new Error("Браузер не поддерживает создание GIF");
      const gif = GIFEncoder();
      for (let frame = 0; frame < frames; frame++) {
        const frozenSvg = buildAnimated(svgText, effectiveAnimations, false, frame / fps); const inner = new DOMParser().parseFromString(frozenSvg, "image/svg+xml").documentElement;
        inner.setAttribute("x", String(inset)); inner.setAttribute("y", String(inset)); inner.setAttribute("width", String(artworkSize)); inner.setAttribute("height", String(artworkSize)); inner.setAttribute("preserveAspectRatio", "xMidYMid meet"); inner.setAttribute("overflow", "visible");
        const sceneSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">${new XMLSerializer().serializeToString(inner)}</svg>`; const url = URL.createObjectURL(new Blob([sceneSvg], { type: "image/svg+xml" })); const image = new Image();
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Не удалось отрисовать кадр GIF")); image.src = url; });
        ctx.clearRect(0, 0, width, height); ctx.drawImage(image, 0, 0, width, height); URL.revokeObjectURL(url);
        const rgba = ctx.getImageData(0, 0, width, height).data; ditherGifAlpha(rgba, width);
        const palette = quantize(rgba, 256, { format: "rgba4444", oneBitAlpha: 1, clearAlpha: true });
        let transparentIndex = palette.findIndex(color => color.length > 3 && color[3] === 0);
        if (transparentIndex < 0) { palette.unshift([0, 0, 0, 0]); transparentIndex = 0; if (palette.length > 256) palette.pop(); }
        const index = applyPalette(rgba, palette, "rgba4444");
        gif.writeFrame(index, width, height, { palette, delay: 20, repeat: 0, transparent: true, transparentIndex, dispose: 2 });
        setGifProgress(Math.round(((frame + 1) / frames) * 100)); if (frame % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      gif.finish(); const blob = new Blob([gif.bytes()], { type: "image/gif" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${fileName}-animated.gif`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось создать GIF"); } finally { setGifProgress(null); }
  };

  return <main className="app-shell">
    <section className="workspace">
      <aside className="layers-panel panel"><div className="panel-title"><span>Слои</span></div><button className={`layer root ${selected.includes("__root") ? "active" : ""}`} onClick={() => choose("__root", false)}><i>◇</i><span>Вся иконка</span>{animations.__root && <b>●</b>}</button><div className="tree-line" />{layers.map((l, i) => <button key={l.id} className={`layer ${selected.includes(l.id) ? "active" : ""}`} onClick={(e) => choose(l.id, e.metaKey || e.ctrlKey)}><i>{l.tag === "g" ? "⌗" : l.tag === "path" ? "⌁" : "○"}</i><span>{l.label}</span><small>{l.tag}</small>{animations[l.id] && <b>●</b>}</button>)}<div className="layer-hint">⌘ + клик — выбрать несколько</div></aside>
      <section className="stage panel">
        <div className={`canvas ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
          <div className="stage-background-controls" aria-label="Фон сцены"><div className="background-picker"><button className={sceneBackground === "light" ? "active" : ""} onClick={() => setSceneBackground("light")}><i className="light-swatch"/>Светлый</button><button className={sceneBackground === "dark" ? "active" : ""} onClick={() => setSceneBackground("dark")}><i className="dark-swatch"/>Тёмный</button></div></div>
          <div className="grid"/><div className={`artboard ${sceneBackground}`} data-scene-size="400 × 400" onClick={(e) => { const el = (e.target as Element).closest("[data-motion-id]"); if (el) choose(el.getAttribute("data-motion-id")!, e.metaKey || e.ctrlKey); }} dangerouslySetInnerHTML={{ __html: preview }}/>
          <button className="drop-note" onClick={() => fileRef.current?.click()}><span>↥</span><div><b>Перетащите SVG сюда</b><small>или нажмите, чтобы выбрать файл</small></div></button>
          {error && <div className="error">{error}</div>}<input ref={fileRef} hidden type="file" accept=".svg,image/svg+xml" onChange={(e: ChangeEvent<HTMLInputElement>) => readFile(e.target.files?.[0])}/>
        </div>
        <div className="timeline"><button onClick={() => setPlaying(!playing)}>{playing ? "Ⅱ" : "▶"}</button><span className="time">00:00.00</span><div className="track"><i style={{ left: `${Math.min(96, settings.delay / (settings.delay + settings.duration || 1) * 100)}%` }}/><b style={{ width: `${Math.max(12, settings.duration / 5 * 100)}%` }}/></div><span>{settings.duration.toFixed(2)}s</span></div>
      </section>
      <aside className="controls panel"><div className="panel-title"><span>Пресеты</span></div><div className="controls-scroll">
        <div className="preset-list">{presets.map(p => <button key={p.id} className={settings.preset === p.id ? "active" : ""} onClick={() => applyPreset(p.id)}><i>{p.icon}</i><span><b>{p.name}</b><small>{p.note}</small></span><em>▶</em></button>)}</div>
        {settings.preset ? <div className="preset-settings">
          {settings.preset === "bell" && <div className="setting-group"><label>Точка подвеса</label><div className="origin-grid">{[["0% 0%","↖"],["50% 0%","↑"],["100% 0%","↗"],["0% 50%","←"],["50% 50%","•"],["100% 50%","→"],["0% 100%","↙"],["50% 100%","↓"],["100% 100%","↘"]].map(([v,n]) => <button key={v} className={settings.origin === v ? "active" : ""} title={v} onClick={() => updateAnimation({origin:v})}>{n}</button>)}</div></div>}
          <div className="two"><Field label="Длительность" suffix="с" value={settings.duration} min={.1} step={.1} onChange={v => updateAnimation({duration:v})}/><Field label="Задержка" suffix="с" value={settings.delay} min={0} step={.1} onChange={v => updateAnimation({delay:v})}/></div>
          <div className="setting-group"><label>Характер движения</label><select value={settings.easing} onChange={e => updateAnimation({easing:e.target.value})}>{easingOptions.map(([n,v]) => <option key={v} value={v}>{n}</option>)}</select></div>
          {distancePresets.includes(settings.preset) && <div className="single-setting"><Field label="Амплитуда" suffix="px" value={settings.distance} min={0} step={1} onChange={v => updateAnimation({distance:v})}/></div>}
          {(settings.preset === "rotate" || settings.preset === "bell" || settings.preset === "sway") && <div className="single-setting"><Field label={settings.preset === "bell" ? "Размах" : "Угол"} suffix="°" value={settings.angle} min={0} step={1} onChange={v => updateAnimation({angle:v})}/></div>}
          <div className="two"><div><label>Повтор</label><select value={settings.iterations} onChange={e => updateAnimation({iterations:e.target.value})}><option value="infinite">Всегда</option><option value="1">1 раз</option><option value="2">2 раза</option><option value="3">3 раза</option></select></div>{(settings.preset === "rotate" || settings.preset === "drawForward" || settings.preset === "drawReverse") && <div><label>Направление</label><select value={settings.direction} onChange={e => updateAnimation({direction:e.target.value as Anim["direction"]})}><option value="normal">Вперёд</option><option value="reverse">Назад</option><option value="alternate">Туда-сюда</option></select></div>}</div>
        </div> : null}</div>
        <div className="export-actions"><button className="gif-export" onClick={downloadGif} disabled={!svgText || gifProgress !== null}>{gifProgress === null ? "Экспорт GIF" : `GIF ${gifProgress}%`} <span>↓</span></button><button className="export" onClick={download} disabled={!svgText}>Экспорт SVG <span>↓</span></button></div>
      </aside>
    </section>
    <footer>© 2026 · Аниматор 1.0</footer>
  </main>;
}

function Field({label,suffix,value,min,step,onChange}:{label:string;suffix:string;value:number;min:number;step:number;onChange:(v:number)=>void}) {
  const displayValue = String(Number.isFinite(value) ? Number(value) : min);
  return <div><label>{label}</label><div className="number"><input type="number" value={displayValue} min={min} step={step} onChange={e => onChange(Math.max(min, Number(e.target.value)))} onBlur={e => { e.currentTarget.value = displayValue; }}/><span>{suffix}</span></div></div>;
}
