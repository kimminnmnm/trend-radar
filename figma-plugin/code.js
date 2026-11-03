/*
 * TREND RADAR Studio Import — Figma 플러그인(V5).
 * Content Studio의 "Figma JSON 내보내기"(trend-radar.figma-export/v1)를 읽어 슬라이드·장면마다 프레임을 만든다.
 * - 텍스트·이미지는 서로 다른 레이어로 만들어 따로 고칠 수 있게 한다.
 * - AI 생성 이미지만 IMAGE fill로 넣는다(레이어 이름에 "AI 생성 — 실제 사진 아님").
 * - 실제 근거 이미지(REAL REFERENCE)는 Figma 파일에 복제하지 않고 원본 링크가 적힌 자리표시로 둔다.
 * - 근거 ID·디자인 메모는 프레임의 plugin data와 NOTES 프레임에 남긴다.
 * - "TREND RADAR에서 가져오기": 웹의 "Figma로 보내기" 작업을 플러그인 토큰으로 직접 받는다(F2). JSON 파일 불러오기도 그대로 지원한다.
 * - 기존 페이지의 노드는 지우거나 옮기지 않는다. 새 프레임은 현재 페이지 내용의 오른쪽에 추가한다.
 * - DESIGN ENGINE V2: JSON에 design(Studio가 기획한 장면)이 있으면 그 장면대로 배경·도형·이미지·텍스트를 각각 별도 레이어로 그린다.
 *   텍스트는 실제 Figma 글꼴로 잰 높이가 상자를 넘으면 최소 크기까지 줄이고, 그래도 넘치면 결과에 경고한다. design이 없으면(이전 JSON) 기존 방식.
 * 이 파일은 Figma 샌드박스(전역 figma)와 테스트(Node, module.exports) 양쪽에서 읽힌다.
 */
/* global figma, __html__, module */

var SCHEMA = "trend-radar.figma-export/v1";
var MAX_UNITS = 30;
var FRAME_GAP = 120;
var STYLE_BY_WEIGHT = { 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold" };
var KOREAN_FONT = "Noto Sans KR";
var PLACEMENT_GAP = 400;
var HANDOFF_KEY = "trend-radar-handoff";
var AUTH_KEY = "trend-radar-auth";
var INTER_STYLE = { Regular: "Regular", Medium: "Medium", SemiBold: "Semi Bold", Bold: "Bold", ExtraBold: "Extra Bold" };

function hexToRgb(hex) {
  var value = String(hex || "#000000").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) value = "000000";
  return { r: parseInt(value.slice(0, 2), 16) / 255, g: parseInt(value.slice(2, 4), 16) / 255, b: parseInt(value.slice(4, 6), 16) / 255 };
}

/** "color.surface" 같은 토큰 경로를 실제 값으로 바꾼다. 없으면 fallback. */
function token(tokens, path, fallback) {
  var parts = String(path || "").split(".");
  var node = tokens;
  for (var i = 0; i < parts.length; i += 1) { if (!node || typeof node !== "object") return fallback; node = node[parts[i]]; }
  return node === undefined || node === null ? fallback : node;
}

/**
 * JSON → 그릴 계획(순수 함수, Figma API 없음). 형식이 틀리면 errors에 이유를 담고 frames는 비운다.
 */
function buildFigmaPlan(data) {
  var errors = [];
  if (!data || typeof data !== "object") return { errors: ["JSON 객체가 아닙니다."], frames: [], notes: null, assets: {} };
  if (data.schema !== SCHEMA) errors.push("지원하지 않는 형식입니다: " + String(data.schema) + " (필요: " + SCHEMA + ")");
  var project = data.project || {};
  var canvas = project.canvas || {};
  var W = Number(canvas.width), H = Number(canvas.height);
  if (!(W >= 100 && W <= 4000 && H >= 100 && H <= 4000)) errors.push("캔버스 크기가 올바르지 않습니다.");
  if (!Array.isArray(data.slides) || data.slides.length === 0) errors.push("슬라이드·장면이 없습니다. Studio에서 제작 기획을 먼저 생성하세요.");
  else if (data.slides.length > MAX_UNITS) errors.push("슬라이드가 너무 많습니다(최대 " + MAX_UNITS + ").");
  if (errors.length) return { errors: errors, frames: [], notes: null, assets: {} };

  var tokens = (project.visualTheme && project.visualTheme.tokens) || {};
  var scale = W / 1080;
  var pad = Math.round(W * 0.074);
  var assets = {};
  (data.assets || []).forEach(function (asset) { if (asset && asset.id) assets[asset.id] = asset; });

  var frames = data.slides.map(function (unit, index) {
    var template = unit.layoutTemplateId || "text-only";
    var bgAsset = unit.background && unit.background.imageAssetId ? unit.background.imageAssetId : null;
    var fullBleed = (template === "cover-fullbleed" || template === "video-frame") && bgAsset;
    var onImage = Boolean(fullBleed);
    var texts = [], imageBox = null;
    (unit.elements || []).forEach(function (element) {
      if (element.type === "TEXT" && element.content) {
        var type = token(tokens, element.typographyToken || ("typography." + element.role), {});
        var weight = Number(type.weight) || 400;
        texts.push({
          id: element.id, role: element.role, content: String(element.content),
          family: type.family || "Inter", fallback: type.fallback || "Inter", style: STYLE_BY_WEIGHT[weight] || "Regular",
          size: Math.round((Number(type.size) || 32) * scale * (template === "quote-card" && element.role === "headline" ? 1.1 : 1)),
          lineHeight: Number(type.lineHeight) || 1.3,
          color: onImage ? "#FFFFFF" : element.role === "cta" ? "#FFFFFF" : token(tokens, element.role === "caption" ? "color.muted" : "color.ink", "#14161F"),
          pill: element.role === "cta" ? token(tokens, "color.accent", "#1F2FE0") : null,
        });
      } else if (element.type === "IMAGE" && element.assetId && !(fullBleed && element.assetId === bgAsset)) {
        imageBox = { assetId: element.assetId, x: pad, y: Math.round(H * 0.52), width: W - pad * 2, height: Math.round(H * 0.48) - pad };
      }
    });
    var anchor = template === "text-top-image-bottom" ? "top" : fullBleed ? "bottom" : imageBox ? "top" : "center";
    var number = String(unit.number || index + 1);
    return {
      id: unit.id, name: (number.length < 2 ? "0" + number : number) + " · " + (unit.type || "slide") + (unit.timeRange ? " · " + unit.timeRange : ""),
      x: index * (W + FRAME_GAP), width: W, height: H, template: template,
      fill: token(tokens, (unit.background && unit.background.colorToken) || "color.background", "#FFFFFF"),
      backgroundAssetId: fullBleed ? bgAsset : null, scrim: onImage,
      imageBox: imageBox,
      textBlock: { x: pad, width: W - pad * 2, anchor: anchor, top: pad, bottom: template === "video-frame" ? Math.round(H * 0.8) : H - pad, centerY: Math.round(H / 2), gap: Math.round(24 * scale), items: texts },
      pluginData: { slideId: unit.id, type: unit.type, layoutTemplateId: template, sourceAttribution: unit.sourceAttribution || [], designNotes: unit.designNotes || {} },
    };
  });

  var copy = data.copy || {};
  var editor = data.editorNotes || null;
  var sideWidth = Math.max(560, Math.round(W * 0.6));
  var list = function (title, items) { return items && items.length ? "\n" + title + "\n- " + items.join("\n- ") : ""; };
  // 게시용: 캡션·해시태그만. 제작자 메모는 따로(이전 JSON은 editorNotes가 없어 게시 전 확인·권리만 들어간다).
  var publishingLines = [
    "PUBLISHING · 게시용 캡션",
    copy.caption || "(캡션 없음)",
    copy.hashtags && copy.hashtags.length ? "\n" + copy.hashtags.join(" ") : "",
  ].filter(Boolean);
  var editorLines = [
    "EDITOR NOTES · 제작자 전용 — 게시하지 않음",
    "TREND RADAR · " + (project.title || ""),
    project.contentModeLabel ? "모드: " + project.contentModeLabel + (project.angle ? " · 방향: " + project.angle.title : "") : "",
    project.conceptNotice ? "콘셉트 안내(게시물에 표시): " + project.conceptNotice : "",
    "형식: " + (project.format || "") + " · " + W + "×" + H + (project.brand ? " · 브랜드 " + project.brand : ""),
    editor && editor.summary ? "\n요약\n" + editor.summary : "",
    editor ? list("CONTEXT LOCK · 현상 고정", editor.contextLock || []) : "",
    editor ? list("스토리라인", editor.storyline || []) : "",
    editor ? list("Detail Bank(소재 고유 디테일)", editor.detailBank || []) : "",
    editor ? list("품질 검사(필수 검증 / 편집 신호)", editor.qualityGate || []) : "",
    editor && editor.review ? "\n편집 리뷰\n" + editor.review : "",
    editor ? list("사실 확인 필요(근거 없음)", editor.needsReview.map(function (unit) { return unit.label + ": " + unit.items.join(" / "); })) : "",
    editor ? list("보고서식 표현 경고", (editor.reportPhrases || []).map(function (item) { return (item.unit === "caption" ? "캡션" : item.unit + "번") + " · " + item.phrase; })) : "",
    list("게시 전 확인", (copy.verifyBeforePublishing || []).concat(editor ? editor.factChecks : [])),
    editor ? list("핵심 주장 · 근거 ID", editor.claims.map(function (claim) { return "[" + claim.status + "] " + claim.text + (claim.evidenceIds.length ? " (" + claim.evidenceIds.join(", ") + ")" : ""); })) : "",
    editor ? list("리서치 공백", editor.researchGaps) : "",
    editor && editor.aiDisclosure ? "\nAI 이미지 표시\n" + editor.aiDisclosure : "",
    "\n이미지 출처·권리",
  ].concat((data.assets || []).map(function (asset) { return "- [" + asset.status + "] " + asset.title + " — " + asset.attribution + " · " + asset.rights; })).concat(editor ? (editor.imageRights || []).map(function (item) { return "- " + item; }) : []).filter(Boolean);
  var design = data.design && Array.isArray(data.design.frames) && data.design.frames.length ? data.design : null;
  if (design) {
    frames = design.frames.map(function (scene, index) {
      return {
        id: scene.id, name: scene.name, x: index * (scene.width + FRAME_GAP), width: scene.width, height: scene.height, fill: scene.background, scene: scene.elements || [],
        pluginData: { slideId: scene.id, layout: scene.layout, style: design.style, sourceAttribution: (data.slides[index] && data.slides[index].sourceAttribution) || [], designNotes: (data.slides[index] && data.slides[index].designNotes) || {}, layoutNotes: scene.notes || [] },
      };
    });
    editorLines.splice(4, 0, "디자인: " + design.styleLabel + " · " + design.styleReason, "색: " + (design.colorSources || []).map(function (item) { return item.role + " " + item.color + (item.source === "observed" ? "(Visual DNA 관찰)" : item.source === "rule" ? "(규칙 해석)" : ""); }).join(", "));
    var layoutNotes = design.frames.filter(function (scene) { return scene.notes && scene.notes.length; }).map(function (scene) { return scene.number + "번: " + scene.notes.join(" / "); }).concat(design.notes || []);
    if (layoutNotes.length) editorLines.splice(6, 0, "\n레이아웃 메모\n- " + layoutNotes.join("\n- "));
  }
  return {
    mode: design ? "scene" : "legacy",
    errors: [], frames: frames, assets: assets,
    publishing: { name: "PUBLISHING · 캡션 · " + (project.title || "TREND RADAR"), x: -(sideWidth + FRAME_GAP), width: sideWidth, text: publishingLines.join("\n"), fill: "#F0FFF4", ink: "#14361F" },
    notes: { name: "EDITOR NOTES · 게시 안 함 · " + (project.title || "TREND RADAR"), x: -2 * (sideWidth + FRAME_GAP), width: sideWidth, text: editorLines.join("\n"), fill: "#FFF7EC", ink: "#3A2A10" },
  };
}

/** 이 플러그인이 내려받을 이미지: AI 생성 이미지 중 figmaImage가 있는 것만. */
function imageRequests(data) {
  return (data && Array.isArray(data.assets) ? data.assets : []).filter(function (asset) { return asset.status !== "REAL REFERENCE" && asset.figmaImage && asset.figmaImage.url; }).map(function (asset) { return { id: asset.id, url: asset.figmaImage.url, expiresAt: asset.figmaImage.expiresAt || null }; });
}

/** 한글 글리프가 있는 글꼴을 먼저 시도한다: 토큰 글꼴 → 토큰 fallback → Noto Sans KR(Figma 기본 제공 Google Fonts) → Inter(한글 없음, 최후). */
async function loadFont(api, item, report) {
  var candidates = [{ family: item.family, style: item.style }, { family: item.fallback, style: item.style }, { family: KOREAN_FONT, style: item.style }, { family: KOREAN_FONT, style: "Regular" }, { family: "Inter", style: INTER_STYLE[item.style] || "Regular" }, { family: "Inter", style: "Regular" }];
  for (var i = 0; i < candidates.length; i += 1) {
    try {
      await api.loadFontAsync(candidates[i]);
      if (i > 0) report.fontFallbacks[item.family + " " + item.style] = candidates[i].family + " " + candidates[i].style;
      return candidates[i];
    } catch (missing) { void missing; /* 다음 후보 */ }
  }
  throw new Error("글꼴을 불러오지 못했습니다: " + item.family);
}

function solid(hex, opacity) { var paint = { type: "SOLID", color: hexToRgb(hex) }; if (opacity !== undefined) paint.opacity = opacity; return [paint]; }

/** 자산 하나를 사각형 레이어로 만든다. AI 이미지는 IMAGE fill, 근거 이미지·없는 이미지는 자리표시. */
async function imageLayer(api, plan, assetId, box, images, report, parent) {
  var asset = plan.assets[assetId];
  var rect = api.createRectangle();
  rect.resize(box.width, box.height);
  rect.x = box.x; rect.y = box.y;
  parent.appendChild(rect);
  var bytes = images[assetId];
  if (asset && asset.status !== "REAL REFERENCE" && bytes) {
    var image = api.createImage(bytes);
    rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
    rect.name = "AI 생성 이미지 — 실제 사진 아님 · " + (asset.title || assetId);
    report.images += 1;
    return rect;
  }
  rect.fills = solid("#EEF1FF");
  rect.strokes = solid("#5D6170"); rect.dashPattern = [12, 8]; rect.strokeWeight = 2;
  var label;
  if (asset && asset.status === "REAL REFERENCE") {
    var link = asset.source && asset.source.url ? asset.source.url : "";
    rect.name = "REFERENCE · 원본 링크(복제하지 않음)";
    label = "REFERENCE · 실제 근거 이미지\nFigma 파일에 복제하지 않았습니다.\n" + (link || asset.attribution || "");
    report.references += 1;
  } else {
    rect.name = "이미지 없음 · " + assetId;
    label = "이미지 없음\n" + (asset ? "이미지를 받지 못했습니다. Studio에서 다시 “Figma로 보내기”(또는 JSON 내보내기)를 하세요. 서명 링크가 만료됐을 수 있습니다." : "JSON에 없는 이미지 ID: " + assetId);
    report.missing += 1;
  }
  var font = await loadFont(api, { family: KOREAN_FONT, fallback: KOREAN_FONT, style: "Regular" }, report);
  var text = api.createText();
  text.fontName = font; text.fontSize = Math.max(14, Math.round(box.width / 40)); text.characters = label;
  text.fills = solid("#3A3D4A");
  text.x = box.x + 24; text.y = box.y + 24; text.resize(Math.max(40, box.width - 48), text.height); text.textAutoResize = "HEIGHT";
  text.name = rect.name + " · 안내";
  parent.appendChild(text);
  return rect;
}

/** 새 프레임 위치: 현재 페이지 기존 노드의 오른쪽(겹치거나 옮기지 않음). 빈 페이지면 화면 중앙. */
function placementOrigin(api, plan) {
  var children = api.currentPage && api.currentPage.children ? api.currentPage.children : [];
  var right = null, top = null;
  for (var i = 0; i < children.length; i += 1) {
    var node = children[i];
    if (typeof node.x !== "number" || typeof node.width !== "number") continue;
    right = right === null ? node.x + node.width : Math.max(right, node.x + node.width);
    top = top === null ? node.y : Math.min(top, node.y);
  }
  var notesWidth = plan.notes ? -plan.notes.x : 0;
  if (right === null) return api.viewport && api.viewport.center ? { x: Math.round(api.viewport.center.x) + notesWidth, y: Math.round(api.viewport.center.y) } : { x: notesWidth, y: 0 };
  return { x: Math.round(right + PLACEMENT_GAP + notesWidth), y: Math.round(top || 0) };
}

/** 이 페이지에 같은 작업으로 만든 노드 수(중복 생성 안내용). */
function existingImports(api, handoffId) {
  if (!handoffId || !api.currentPage || !api.currentPage.children) return 0;
  return api.currentPage.children.filter(function (node) { return node.getPluginData && node.getPluginData(HANDOFF_KEY) === handoffId; }).length;
}

/** 위→아래 선형 그라데이션(Figma 변환: 세로 방향). */
var VERTICAL = [[0, 1, 0], [-1, 0, 1]];

/** Studio가 기획한 장면(scene)의 요소 하나를 편집 가능한 노드로 만든다. 텍스트·이미지·도형은 각각 별도 레이어다. */
async function renderSceneElement(api, plan, element, images, report, parent) {
  var node;
  if (element.kind === "rect" || element.kind === "ellipse" || element.kind === "gradient") {
    node = element.kind === "ellipse" ? api.createEllipse() : api.createRectangle();
    node.resize(Math.max(1, element.w), Math.max(1, element.h));
    if (element.kind === "gradient") {
      var c = hexToRgb(element.color);
      node.fills = [{ type: "GRADIENT_LINEAR", gradientTransform: VERTICAL, gradientStops: [{ position: 0, color: { r: c.r, g: c.g, b: c.b, a: element.from } }, { position: 1, color: { r: c.r, g: c.g, b: c.b, a: element.to } }] }];
    } else {
      node.fills = solid(element.fill, element.opacity === undefined ? undefined : element.opacity);
      if (element.radius && element.kind === "rect") node.cornerRadius = element.radius;
      if (element.stroke) { node.strokes = solid(element.stroke); node.strokeWeight = element.strokeWidth || 1; }
    }
    node.name = element.name;
    parent.appendChild(node);
    node.x = element.x; node.y = element.y;
    if (element.rotation) node.rotation = element.rotation;
    return node;
  }
  if (element.kind === "image") {
    var asset = plan.assets[element.assetId];
    var bytes = images[element.assetId];
    node = api.createRectangle();
    node.resize(Math.max(1, element.w), Math.max(1, element.h));
    if (element.radius) node.cornerRadius = element.radius;
    parent.appendChild(node);
    node.x = element.x; node.y = element.y;
    if (asset && asset.status !== "REAL REFERENCE" && bytes) {
      // FILL: 비율을 유지한 채 상자를 채우도록 잘라 넣는다(늘리지 않음).
      node.fills = [{ type: "IMAGE", imageHash: api.createImage(bytes).hash, scaleMode: "FILL" }];
      node.name = "AI 생성 이미지 — 실제 사진 아님 · " + (asset.title || element.assetId);
      report.images += 1;
    } else {
      node.fills = solid(element.fallback || "#CCCCCC");
      node.name = (asset && asset.status === "REAL REFERENCE" ? "REFERENCE · 원본 링크(복제하지 않음)" : "이미지 없음") + " · " + element.name;
      if (asset && asset.status === "REAL REFERENCE") report.references += 1; else report.missing += 1;
    }
    return node;
  }
  // text
  var font = await loadFont(api, { family: element.font.family, fallback: KOREAN_FONT, style: element.font.style }, report);
  var text = api.createText();
  var size = element.size;
  text.fontName = font; text.fontSize = size; text.lineHeight = { unit: "PIXELS", value: Math.round(size * element.lineHeight) };
  if (element.tracking) text.letterSpacing = { unit: "PERCENT", value: element.tracking };
  text.characters = element.text;
  text.fills = solid(element.color);
  text.textAlignHorizontal = element.align;
  text.resize(Math.max(1, element.w), text.height); text.textAutoResize = "HEIGHT";
  // 실제 글꼴로 잰 높이가 상자를 넘으면 최소 크기까지 2px씩 줄인다(무조건 작게 만들지 않음).
  while (text.height > element.h + 1 && size > element.minSize) {
    size -= 2; text.fontSize = size; text.lineHeight = { unit: "PIXELS", value: Math.round(size * element.lineHeight) };
  }
  if (text.height > element.h + 1) report.overflows.push(element.name);
  if (size !== element.size) report.fitted += 1;
  text.name = element.name;
  parent.appendChild(text);
  text.x = element.x;
  text.y = element.valign === "BOTTOM" ? element.y + element.h - text.height : element.valign === "CENTER" ? element.y + (element.h - text.height) / 2 : element.y;
  report.texts += 1;
  return text;
}

/** 계획을 실제 Figma 노드로 만든다. api는 전역 figma(테스트에서는 가짜 객체). */
async function renderPlan(api, plan, images, options) {
  images = images || {};
  options = options || {};
  var report = { frames: 0, texts: 0, images: 0, references: 0, missing: 0, fontFallbacks: {}, failedFrames: [], overflows: [], fitted: 0, mode: plan.mode || "legacy" };
  var origin = placementOrigin(api, plan);
  var prefix = options.code ? "TR " + options.code + " · " : "";
  var created = [];
  for (var f = 0; f < plan.frames.length; f += 1) {
    var spec = plan.frames[f];
    var frame = null;
    try {
    frame = api.createFrame();
    frame.name = prefix + spec.name;
    frame.resize(spec.width, spec.height);
    frame.x = origin.x + spec.x; frame.y = origin.y;
    frame.fills = solid(spec.fill);
    frame.clipsContent = true;
    frame.setPluginData("trend-radar", JSON.stringify(spec.pluginData));
    if (options.handoffId) frame.setPluginData(HANDOFF_KEY, options.handoffId);
    api.currentPage.appendChild(frame);
    if (spec.scene) {
      for (var e = 0; e < spec.scene.length; e += 1) await renderSceneElement(api, plan, spec.scene[e], images, report, frame);
    } else {
    if (spec.backgroundAssetId) await imageLayer(api, plan, spec.backgroundAssetId, { x: 0, y: 0, width: spec.width, height: spec.height }, images, report, frame);
    if (spec.scrim) {
      var scrim = api.createRectangle();
      scrim.resize(spec.width, Math.round(spec.height * 0.5)); scrim.x = 0; scrim.y = spec.height - Math.round(spec.height * 0.5);
      scrim.fills = [{ type: "GRADIENT_LINEAR", gradientTransform: [[0, 1, 0], [-1, 0, 1]], gradientStops: [{ position: 0, color: { r: 0, g: 0, b: 0, a: 0.7 } }, { position: 1, color: { r: 0, g: 0, b: 0, a: 0 } }] }];
      scrim.name = "가독성 그라데이션";
      frame.appendChild(scrim);
    }
    if (spec.imageBox) await imageLayer(api, plan, spec.imageBox.assetId, spec.imageBox, images, report, frame);

    var block = spec.textBlock, nodes = [];
    for (var t = 0; t < block.items.length; t += 1) {
      var item = block.items[t];
      var font = await loadFont(api, item, report);
      var text = api.createText();
      text.fontName = font; text.fontSize = item.size; text.lineHeight = { unit: "PIXELS", value: Math.round(item.size * item.lineHeight) };
      text.characters = item.content;
      text.fills = solid(item.color);
      text.textAlignHorizontal = block.anchor === "center" || item.pill ? "CENTER" : "LEFT";
      text.resize(block.width, text.height); text.textAutoResize = "HEIGHT";
      text.x = block.x;
      text.name = item.role + " · " + item.id;
      nodes.push({ node: text, item: item });
      report.texts += 1;
    }
    var total = nodes.reduce(function (sum, entry, i) { return sum + entry.node.height + (entry.item.pill ? 48 : 0) + (i ? block.gap : 0); }, 0);
    var y = block.anchor === "top" ? block.top : block.anchor === "bottom" ? block.bottom - total : Math.round(block.centerY - total / 2);
    for (var n = 0; n < nodes.length; n += 1) {
      var entry = nodes[n];
      if (entry.item.pill) {
        var pill = api.createRectangle();
        pill.resize(block.width, entry.node.height + 48); pill.x = block.x; pill.y = y; pill.cornerRadius = Math.round((entry.node.height + 48) / 2);
        pill.fills = solid(entry.item.pill); pill.name = "CTA 버튼";
        frame.appendChild(pill);
        entry.node.y = y + 24;
        y += entry.node.height + 48 + block.gap;
      } else {
        entry.node.y = y;
        y += entry.node.height + block.gap;
      }
      frame.appendChild(entry.node);
    }
    }
    created.push(frame);
    report.frames += 1;
    } catch (error) {
      // 한 슬라이드가 실패해도 나머지는 만든다. 반쯤 만든 프레임은 지운다(이 플러그인이 방금 만든 노드만).
      if (frame && frame.remove) { try { frame.remove(); } catch (ignored) { void ignored; } }
      report.failedFrames.push({ name: spec.name, error: String(error && error.message ? error.message : error) });
    }
  }
  // 게시용 캡션 프레임과 EDITOR NOTES 프레임을 따로 만든다(슬라이드 왼쪽).
  var sides = [plan.publishing, plan.notes].filter(Boolean);
  for (var k = 0; k < sides.length; k += 1) {
    var side = sides[k];
    var sideFont = await loadFont(api, { family: KOREAN_FONT, fallback: KOREAN_FONT, style: "Regular" }, report);
    var note = api.createFrame();
    note.name = prefix + side.name;
    if (options.handoffId) note.setPluginData(HANDOFF_KEY, options.handoffId);
    note.fills = solid(side.fill || "#FFF7EC");
    note.x = origin.x + side.x; note.y = origin.y;
    var body = api.createText();
    body.fontName = sideFont; body.fontSize = 20; body.characters = side.text; body.fills = solid(side.ink || "#3A2A10");
    body.x = 32; body.y = 32; body.resize(side.width - 64, body.height); body.textAutoResize = "HEIGHT";
    body.name = side === plan.notes ? "editor-notes" : "caption";
    note.resize(side.width, body.height + 64);
    note.appendChild(body);
    api.currentPage.appendChild(note);
    created.unshift(note);
  }
  // 다음부터는 파일에서 바로 다시 실행할 수 있게 relaunch 버튼을 단다(manifest relaunchButtons).
  if (api.root && api.root.setRelaunchData) api.root.setRelaunchData({ open: "TREND RADAR에서 보낸 작업 가져오기" });
  api.currentPage.selection = created;
  if (api.viewport && api.viewport.scrollAndZoomIntoView) api.viewport.scrollAndZoomIntoView(created);
  return report;
}

if (typeof figma !== "undefined") {
  figma.showUI(__html__, { width: 400, height: 600, themeColors: true });
  figma.clientStorage.getAsync(AUTH_KEY).then(function (auth) { figma.ui.postMessage({ type: "init", auth: auth || null, command: figma.command || "" }); });
  figma.ui.onmessage = async function (message) {
    if (!message) return;
    // 연결 토큰은 이 기기의 Figma clientStorage에만 둔다(Figma 서버에 저장되지 않음).
    if (message.type === "save-auth") { await figma.clientStorage.setAsync(AUTH_KEY, { token: message.token, server: message.server, connectedAt: new Date().toISOString() }); return; }
    if (message.type === "save-server") { var current = (await figma.clientStorage.getAsync(AUTH_KEY)) || {}; current.server = message.server; await figma.clientStorage.setAsync(AUTH_KEY, current); return; }
    if (message.type === "clear-auth") { var keep = (await figma.clientStorage.getAsync(AUTH_KEY)) || {}; await figma.clientStorage.setAsync(AUTH_KEY, { server: keep.server }); return; }
    if (message.type !== "build") return;
    try {
      var data = message.data;
      if (message.handoffId && (!data || !data.handoff || data.handoff.id !== message.handoffId)) { figma.ui.postMessage({ type: "error", code: "INVALID", message: "받은 데이터가 선택한 작업과 다릅니다. 다시 불러오세요." }); return; }
      var plan = buildFigmaPlan(data);
      if (plan.errors.length) { figma.ui.postMessage({ type: "error", code: "INVALID", message: plan.errors.join("\n") }); return; }
      var already = existingImports(figma, message.handoffId);
      if (already && !message.force) { figma.ui.postMessage({ type: "exists", count: already }); return; }
      var report = await renderPlan(figma, plan, message.images || {}, { handoffId: message.handoffId, code: message.code });
      figma.ui.postMessage({ type: "done", report: report, failedImages: message.failed || {} });
      figma.notify(report.failedFrames.length ? "일부 슬라이드를 만들지 못했습니다 · " + report.frames + "/" + plan.frames.length : "Figma에 편집 가능한 카드뉴스가 생성되었습니다.");
    } catch (error) {
      figma.ui.postMessage({ type: "error", code: "RENDER", message: String(error && error.message ? error.message : error) });
    }
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = { SCHEMA: SCHEMA, HANDOFF_KEY: HANDOFF_KEY, renderSceneElement: renderSceneElement, buildFigmaPlan: buildFigmaPlan, imageRequests: imageRequests, renderPlan: renderPlan, existingImports: existingImports, placementOrigin: placementOrigin, hexToRgb: hexToRgb };
