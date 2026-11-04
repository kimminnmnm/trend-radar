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
  var origin = options.origin || placementOrigin(api, plan);
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
    if (options.collect) options.collect.push(frame);
    report.frames += 1;
    } catch (error) {
      // 한 슬라이드가 실패해도 나머지는 만든다. 반쯤 만든 프레임은 지운다(이 플러그인이 방금 만든 노드만).
      if (frame && frame.remove) { try { frame.remove(); } catch (ignored) { void ignored; } }
      report.failedFrames.push({ name: spec.name, error: String(error && error.message ? error.message : error) });
    }
  }
  // 게시용 캡션 프레임과 EDITOR NOTES 프레임을 따로 만든다(슬라이드 왼쪽).
  var sides = options.skipSides ? [] : [plan.publishing, plan.notes].filter(Boolean);
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
    if (options.collect) options.collect.push(note);
  }
  // 다음부터는 파일에서 바로 다시 실행할 수 있게 relaunch 버튼을 단다(manifest relaunchButtons).
  if (api.root && api.root.setRelaunchData) api.root.setRelaunchData({ open: "TREND RADAR에서 보낸 작업 가져오기" });
  if (!options.keepSelection) {
    api.currentPage.selection = created;
    if (api.viewport && api.viewport.scrollAndZoomIntoView) api.viewport.scrollAndZoomIntoView(created);
  }
  return report;
}

/* ---------- MY TEMPLATES: 사용자가 Figma에서 만든 카드뉴스 템플릿 8종 ---------- */
/*
 * - "Templates" 페이지의 프레임을 이름으로 찾는다(TEMPLATE_COVER_01~03 · TEMPLATE_BODY_01~03 · TEMPLATE_CTA_01~02).
 * - 원본은 읽기만 한다. 슬라이드마다 원본을 복제(clone)하고 복제본의 플레이스홀더 레이어에만 내용을 넣는다.
 * - 생성 전 점검(scanTemplates): 슬롯·글꼴(실제로 불러와 확인)·인식 안 된 텍스트 레이어(견본 문구가 남을 곳)·이미지 슬롯 문제.
 * - 텍스트: 레이어가 쓰는 글꼴을 모두 불러온 뒤 고친다. 글꼴이 없으면 템플릿 글꼴을 바꾸지 않고(사용자가 대체 글꼴을 고른 경우만 대체),
 *   견본 문구가 결과물에 남지 않게 그 레이어를 숨기고 없는 글꼴 이름을 알린다.
 *   상자를 넘치면 원래 크기의 85%(최소 12px)까지만 줄이고, 그래도 넘치면 경고한다(글자를 자르지 않음).
 * - 이미지: 그 슬라이드(slideId)의 자산만 IMAGE fill(FILL)로. 템플릿의 그라데이션·오버레이 채우기는 이미지 위에 그대로 둔다.
 *   넣지 못하면 이유(연결된 이미지 없음 · 이미지 파일 못 받음 · 실제 근거 이미지라 복제 안 함)를 슬롯 위에 적는다.
 *   슬라이드당 여러 장: BG_IMAGE(별칭 IMAGE_BG·BACKGROUND_IMAGE) ← 배경 역할, IMAGE_MAIN ← 대표, IMAGE_2~4 ← 나머지 순서.
 *   배경 슬롯(또는 프레임을 거의 덮는 IMAGE_MAIN)에 넣을 이미지가 없으면 단색으로 채운다: BG_COLOR 레이어 → 프레임 배경 → 프로젝트 팔레트 → #F5F5F5.
 * - 맞는 템플릿이 없는 슬라이드는 그 슬라이드만 AUTO DESIGN으로 그린다.
 */
var TEMPLATE_PAGE = "Templates";
var TEMPLATE_NAMES = ["TEMPLATE_COVER_01", "TEMPLATE_COVER_02", "TEMPLATE_COVER_03", "TEMPLATE_BODY_01", "TEMPLATE_BODY_02", "TEMPLATE_BODY_03", "TEMPLATE_CTA_01", "TEMPLATE_CTA_02"];
var TEXT_SLOTS = ["TITLE", "SUBTITLE", "BODY", "CATEGORY", "PAGE_NUMBER", "CTA"];
var IMAGE_SLOTS = ["IMAGE_MAIN", "IMAGE_1", "IMAGE_2", "IMAGE_3", "IMAGE_4", "BG_IMAGE"];
var ALL_SLOTS = TEXT_SLOTS.concat(IMAGE_SLOTS);
/** 배경 이미지 슬롯의 다른 이름. */
var SLOT_ALIASES = { IMAGE_BG: "BG_IMAGE", BACKGROUND_IMAGE: "BG_IMAGE" };
var BG_COLOR_LAYER = "BG_COLOR";
var BG_FALLBACK = "#F5F5F5";
/** IMAGE_MAIN이 프레임 넓이의 이만큼 이상을 덮으면 배경(꽉 찬 사진) 슬롯으로 본다. */
var BG_LIKE_RATIO = 0.9;
var MIN_TEMPLATE_FONT = 12;
var TEMPLATE_SHRINK = 0.85;
var TEMPLATE_KEY = "trend-radar-template";
var IMAGE_REASONS = { "no-link": "이 슬라이드에 연결된 이미지가 없음(Studio에서 이미지를 연결하거나 생성)", "not-received": "이미지 파일을 받지 못함", reference: "실제 근거 이미지라 Figma에 복제하지 않음(원본 링크는 EDITOR NOTES)", "unknown-asset": "JSON에 없는 이미지 ID" };

function templateKind(name) { var match = /^TEMPLATE_(COVER|BODY|CTA)_\d{2}$/.exec(name); return match ? match[1] : null; }
function slideKind(type) { return type === "cover" ? "COVER" : type === "cta" || type === "closing" ? "CTA" : "BODY"; }
function pad2(value) { var text = String(value); return text.length < 2 ? "0" + text : text; }
function normalizeTemplateName(name) { return String(name || "").trim().toUpperCase().replace(/[\s-]+/g, "_").replace(/_(\d)$/, "_0$1"); }
/** 레이어 이름 → 슬롯. 정확한 이름(exact)이 아니어도 대소문자·공백·하이픈 차이는 인식하고 이름을 고치라고 알린다. */
function slotOf(node) {
  var name = String(node && node.name || "");
  if (ALL_SLOTS.indexOf(name) >= 0) return { slot: name, exact: true };
  if (SLOT_ALIASES[name]) return { slot: SLOT_ALIASES[name], exact: true };
  var loose = name.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (SLOT_ALIASES[loose]) loose = SLOT_ALIASES[loose];
  // 번호 이미지 슬롯의 흔한 변형: IMAGE1 · IMAGE_01 · IMG_1 · IMG1 → IMAGE_1 (정확한 이름으로 바꾸라고 안내한다)
  var numbered = /^(?:IMAGE|IMG)_?0*([1-4])$/.exec(loose);
  if (numbered) loose = "IMAGE_" + numbered[1];
  return ALL_SLOTS.indexOf(loose) >= 0 ? { slot: loose, exact: false } : null;
}
/** 이미 슬롯으로 인식한 레이어(예: IMAGE_MAIN 그룹) 안에 있는가. */
function insideSlot(node, root) { for (var current = node.parent; current && current !== root; current = current.parent) if (slotOf(current)) return true; return false; }
/** 레이어나 그 상위가 숨겨져 있는가(템플릿 프레임까지). */
function hiddenWithin(node, root) { for (var current = node; current && current !== root; current = current.parent) if (current.visible === false) return true; return false; }
function looseName(node) { return String(node && node.name || "").trim().toUpperCase().replace(/[\s-]+/g, "_"); }
function canHoldImage(node) { return Boolean(node) && node.type !== "TEXT" && node.type !== "GROUP" && "fills" in node && Array.isArray(node.fills); }
function hasImagePaint(node) { return canHoldImage(node) && node.fills.some(function (paint) { return paint.type === "IMAGE"; }); }
function descendants(node) { return node && node.findAll ? node.findAll(function () { return true; }) : []; }
/** 이미지를 실제로 채울 레이어: 그룹이면 안쪽(견본 사진이 있는 레이어 → 가장 큰 레이어), 프레임 안에 견본 사진 레이어가 있으면 그 레이어. */
function imageTarget(node) {
  if (!node) return null;
  if (node.type === "GROUP" || (canHoldImage(node) && !hasImagePaint(node) && node.children && node.children.length)) {
    var inner = descendants(node).filter(canHoldImage);
    var withImage = inner.filter(hasImagePaint);
    var pool = withImage.length ? withImage : node.type === "GROUP" ? inner : [];
    if (pool.length) return pool.sort(function (a, b) { return b.width * b.height - a.width * a.height; })[0];
  }
  return canHoldImage(node) ? node : null;
}
/** 이미지 위에 불투명하게 덮는 채우기(이미지가 가려짐)가 있는가. 이미지보다 뒤(배열 앞)의 채우기는 아래에 깔린다. */
function coversImage(paints) {
  return paints.some(function (paint) {
    if (paint.visible === false) return false;
    var opacity = paint.opacity === undefined ? 1 : paint.opacity;
    if (opacity < 0.99) return false;
    if (paint.type === "SOLID") return true;
    if (/^GRADIENT/.test(paint.type || "")) return (paint.gradientStops || []).every(function (stop) { return !stop.color || stop.color.a === undefined || stop.color.a >= 0.99; });
    return false;
  });
}
/** 이미지를 넣을 칠 자리: 템플릿의 IMAGE 칠 → 없으면 맨 아래 단색(이미지 자리표시 바탕) → 없으면 맨 아래에 추가. 그 위의 그라데이션·오버레이는 그대로 둔다. */
function imageBase(fills) {
  var at = fills.findIndex(function (paint) { return paint.type === "IMAGE"; });
  if (at >= 0) return { index: at, kind: "image" };
  if (fills.length && fills[0].type === "SOLID" && fills[0].visible !== false) return { index: 0, kind: "solid" };
  return { index: -1, kind: "none" };
}
/** 배경 슬롯: BG_IMAGE(별칭 포함), 또는 프레임 넓이의 90% 이상을 덮는 IMAGE_MAIN·IMAGE_1. */
function isBackgroundSlot(slot, node, frame) {
  if (slot === "BG_IMAGE") return true;
  if (slot !== "IMAGE_MAIN" && slot !== "IMAGE_1") return false;
  var target = imageTarget(node) || node;
  return Boolean(frame && frame.width && frame.height) && target.width * target.height >= BG_LIKE_RATIO * frame.width * frame.height;
}
/** 보이는 불투명 단색 칠(배경색으로 쓸 수 있는 것). */
function opaqueSolid(fills) {
  if (!Array.isArray(fills)) return null;
  for (var i = 0; i < fills.length; i += 1) {
    var paint = fills[i];
    if (paint.type === "SOLID" && paint.visible !== false && (paint.opacity === undefined || paint.opacity >= 0.99)) return paint;
  }
  return null;
}
function rgbToHex(color) { return "#" + [color.r, color.g, color.b].map(function (value) { var hex = Math.round(value * 255).toString(16).toUpperCase(); return hex.length < 2 ? "0" + hex : hex; }).join(""); }
/** 배경 대체 색: 템플릿 안 BG_COLOR 레이어 → 템플릿 프레임 배경 → 프로젝트 팔레트 대표색 → #F5F5F5. palette가 없으면(생성 전 점검) 3·4번을 함께 적는다. */
function backgroundFallback(frame, palette) {
  var layer = descendants(frame).filter(function (node) { return looseName(node) === BG_COLOR_LAYER && opaqueSolid(node.fills); })[0];
  var paint = layer ? opaqueSolid(layer.fills) : opaqueSolid(frame && frame.fills);
  if (paint) return { color: { r: paint.color.r, g: paint.color.g, b: paint.color.b }, hex: rgbToHex(paint.color), source: layer ? "BG_COLOR 레이어" : "템플릿 프레임 배경" };
  if (palette === undefined) return { color: hexToRgb(BG_FALLBACK), hex: null, source: "프로젝트 팔레트 대표색(없으면 " + BG_FALLBACK + ")" };
  if (palette && palette.primary) return { color: hexToRgb(palette.primary), hex: palette.primary.toUpperCase(), source: "프로젝트 팔레트 대표색" };
  return { color: hexToRgb(BG_FALLBACK), hex: BG_FALLBACK, source: "기본값" };
}
function textFonts(api, node) {
  var length = node.characters ? node.characters.length : 0;
  return node.fontName === api.mixed ? (length ? node.getRangeAllFontNames(0, length) : []) : [node.fontName];
}
function fontLabel(font) { return font ? font.family + " " + font.style : "?"; }
/** 글꼴을 실제로 불러와 본다. 실패한 글꼴 이름을 돌려준다(캐시). */
async function failedFonts(api, fonts, cache) {
  var failed = [];
  for (var i = 0; i < fonts.length; i += 1) {
    var key = fontLabel(fonts[i]);
    if (!(key in cache)) { try { await api.loadFontAsync(fonts[i]); cache[key] = true; } catch (error) { void error; cache[key] = false; } }
    if (!cache[key] && failed.indexOf(key) < 0) failed.push(key);
  }
  return failed;
}
function preview(text) { var value = String(text || "").replace(/\s+/g, " ").trim(); return value.length > 24 ? value.slice(0, 24) + "…" : value; }

function findTemplatePage(api) {
  var pages = api.root && api.root.children ? api.root.children : [];
  for (var i = 0; i < pages.length; i += 1) if (pages[i].name === TEMPLATE_PAGE) return { page: pages[i], note: null };
  for (var j = 0; j < pages.length; j += 1) if (normalizeTemplateName(pages[j].name) === "TEMPLATES") return { page: pages[j], note: "페이지 이름이 \"" + pages[j].name + "\"입니다. 그대로 쓰지만 \"Templates\"로 바꾸는 것을 권장합니다." };
  return { page: null, note: null };
}

/** 생성 전 점검. 원본은 읽기만 하고(글꼴은 불러와 보기만) 아무것도 바꾸지 않는다. */
async function scanTemplates(api) {
  var found = findTemplatePage(api);
  var result = { page: found.page ? found.page.name : null, templates: {}, missing: [], problems: [] };
  if (found.note) result.problems.push(found.note);
  if (!found.page) {
    result.missing = TEMPLATE_NAMES.slice();
    result.problems.push("\"Templates\" 페이지가 없습니다. 페이지를 만들고 템플릿 프레임(" + TEMPLATE_NAMES.join(", ") + ")을 넣어 주세요.");
    return result;
  }
  if (found.page.loadAsync) await found.page.loadAsync();
  var children = found.page.children || [];
  var fontCache = {};
  for (var n = 0; n < TEMPLATE_NAMES.length; n += 1) {
    var name = TEMPLATE_NAMES[n];
    var matches = children.filter(function (node) { return node.name === name; });
    if (!matches.length) { result.missing.push(name); continue; }
    if (matches.length > 1) result.problems.push(name + " 프레임이 " + matches.length + "개입니다. 첫 번째만 씁니다.");
    var node = matches[0];
    if (node.type !== "FRAME" && node.type !== "COMPONENT") { result.problems.push(name + "은(는) 프레임이 아닙니다(" + node.type + "). 프레임으로 바꿔 주세요."); continue; }
    var info = { kind: templateKind(name), width: node.width, height: node.height, slots: [], imageSlots: 0, background: null, fallback: null, summary: "", fonts: [], missingFonts: [], unrecognizedTexts: [], warnings: [] };
    var layers = descendants(node);
    for (var l = 0; l < layers.length; l += 1) {
      var layer = layers[l], slot = slotOf(layer);
      if (!slot) {
        if (layer.type === "TEXT" && !/^STATIC/i.test(layer.name) && !/^AI 생성/.test(layer.name)) info.unrecognizedTexts.push({ layer: layer.name, preview: preview(layer.characters) });
        else if (layer.type !== "TEXT" && /^(IMAGE|IMG|PHOTO|PICTURE|PIC|사진|이미지)/.test(looseName(layer)) && !insideSlot(layer, node)) info.warnings.push("\"" + layer.name + "\": 이미지 자리처럼 보이지만 슬롯으로 인식하지 않았습니다. IMAGE_MAIN·IMAGE_1·IMAGE_2·BG_IMAGE 중 하나로 이름을 바꾸세요.");
        continue;
      }
      var isText = TEXT_SLOTS.indexOf(slot.slot) >= 0;
      if (!slot.exact) info.warnings.push("\"" + layer.name + "\" → \"" + slot.slot + "\"(으)로 인식했습니다. 정확한 이름으로 바꾸는 것을 권장합니다.");
      if (isText) {
        if (layer.type !== "TEXT") { info.warnings.push(slot.slot + ": 텍스트 레이어가 아니라 건너뜁니다(" + layer.type + ")."); continue; }
        var fonts = textFonts(api, layer).map(fontLabel);
        fonts.forEach(function (label) { if (info.fonts.indexOf(label) < 0) info.fonts.push(label); });
        var failed = await failedFonts(api, textFonts(api, layer), fontCache);
        if (layer.hasMissingFont || failed.length) info.missingFonts.push({ slot: slot.slot, layer: layer.name, fonts: failed.length ? failed : fonts, preview: preview(layer.characters) });
      } else {
        var target = imageTarget(layer);
        if (!target) { info.warnings.push(slot.slot + ": 이미지를 채울 레이어가 없습니다(" + layer.type + "). 사각형·프레임처럼 채우기가 있는 레이어로 만들어 주세요."); continue; }
        if (target.isMask) info.warnings.push(slot.slot + ": \"" + target.name + "\"은(는) 마스크 레이어라 이미지를 채워도 보이지 않습니다. 마스크를 풀거나, 마스크 위 사진 레이어에 " + slot.slot + " 이름을 주세요.");
        if (hiddenWithin(target, node)) info.warnings.push(slot.slot + ": \"" + target.name + "\" 레이어(또는 상위 레이어)가 숨겨져 있어 이미지가 보이지 않습니다.");
        if (target !== layer) info.warnings.push(slot.slot + ": " + layer.type + " 안의 \"" + target.name + "\" 레이어에 이미지를 넣습니다.");
        var base = imageBase(target.fills);
        if (base.kind === "solid") info.warnings.push(slot.slot + ": IMAGE 칠이 없어 맨 아래 단색 바탕을 이미지로 바꿉니다(그 위의 그라데이션·오버레이는 유지).");
        var above = target.fills.slice(base.index + 1);
        if (coversImage(above)) info.warnings.push(slot.slot + ": 이미지 위에 불투명한 채우기가 있어 이미지가 가려질 수 있습니다(템플릿의 채우기 순서·투명도 확인).");
        if (!info.background && isBackgroundSlot(slot.slot, layer, node)) info.background = slot.slot === "BG_IMAGE" ? layer.name : slot.slot + "(프레임 크기와 비슷해 배경으로 처리)";
      }
      if (info.slots.indexOf(slot.slot) < 0) info.slots.push(slot.slot);
    }
    info.imageSlots = generalImageSlots(info.slots);
    var fallback = backgroundFallback(node);
    info.fallback = { hex: fallback.hex, source: fallback.source };
    info.summary = "배경 이미지 슬롯 " + (info.background ? "있음 · " + info.background : "없음") + " · 일반 이미지 슬롯 " + info.imageSlots + "개 · 제목 " + (info.slots.indexOf("TITLE") >= 0 ? "있음" : "없음") + " · 본문 " + (info.slots.indexOf("BODY") >= 0 ? "있음" : "없음") + " · 배경 대체 색 " + (fallback.hex ? fallback.hex + "(" + fallback.source + ")" : fallback.source);
    if (!info.slots.length) info.warnings.push("이름이 맞는 플레이스홀더(TITLE·BODY·IMAGE_MAIN·BG_IMAGE 등)가 없습니다.");
    if (info.missingFonts.length) info.warnings.push("글꼴 없음: " + info.missingFonts.map(function (item) { return item.slot + "(" + item.fonts.join(", ") + ")"; }).join(" · ") + " — 대체 글꼴을 고르지 않으면 이 레이어는 숨겨집니다.");
    if (info.unrecognizedTexts.length) info.warnings.push("슬롯으로 인식되지 않은 텍스트(그대로 남음): " + info.unrecognizedTexts.map(function (item) { return "\"" + item.layer + "\" = \"" + item.preview + "\""; }).join(" · ") + " — 내용 자리면 TITLE·BODY 등으로, 고정 문구면 STATIC_으로 시작하게 이름을 바꾸세요.");
    info.nodeId = node.id;
    info.designHash = designHash(api, node);
    result.templates[name] = info;
  }
  children.forEach(function (node) {
    if (TEMPLATE_NAMES.indexOf(node.name) >= 0) return;
    var normalized = normalizeTemplateName(node.name);
    if (TEMPLATE_NAMES.indexOf(normalized) >= 0) result.problems.push("\"" + node.name + "\" → 이름을 \"" + normalized + "\"로 바꾸면 템플릿으로 인식합니다.");
    else if (/^TEMPLATE/.test(normalized)) result.problems.push("\"" + node.name + "\"은(는) 알 수 없는 템플릿 이름입니다. 사용 가능한 이름: " + TEMPLATE_NAMES.join(", "));
  });
  return result;
}

/** 슬라이드 내용: 새 JSON은 slide.template, 이전 JSON은 요소(elements)에서 만든다. 이미지는 이 슬라이드 자산만. */
function slideContent(unit, index, total, project) {
  if (unit.template && unit.template.fields) return unit.template;
  var byRole = {}, imageIds = [];
  (unit.elements || []).forEach(function (element) { if (element.type === "TEXT") byRole[element.role] = element.content; else if (element.type === "IMAGE" && element.assetId && imageIds.indexOf(element.assetId) < 0) imageIds.push(element.assetId); });
  var names = project && project.source && project.source.trendNames ? project.source.trendNames : [];
  return {
    kind: slideKind(unit.type),
    fields: { TITLE: byRole.headline || "", SUBTITLE: byRole.caption || "", BODY: byRole.body || "", CATEGORY: names.join(" × "), PAGE_NUMBER: pad2(index + 1) + " / " + pad2(total), CTA: byRole.cta || "" },
    images: { IMAGE_MAIN: imageIds[0] || null, IMAGE_1: imageIds[0] || null, IMAGE_2: imageIds[1] || null },
    imageList: imageIds.map(function (id, order) { return { assetId: id, role: order ? "detail" : "main" }; }),
  };
}

/** 슬라이드 이미지 목록 [{assetId, role}]: 새 JSON은 template.imageList, 이전 JSON(이미지 1장)은 template.images에서 만든다. */
function slideImageList(content) {
  if (Array.isArray(content.imageList)) return content.imageList.filter(function (item) { return item && item.assetId; });
  var images = content.images || {}, list = [];
  // 이전 JSON은 IMAGE_1이 IMAGE_MAIN과 같은 값이었다(중복은 아래에서 빠진다).
  [images.IMAGE_MAIN || images.IMAGE_1, images.IMAGE_1, images.IMAGE_2, images.IMAGE_3, images.IMAGE_4].forEach(function (id, order) { if (id && !list.some(function (item) { return item.assetId === id; })) list.push({ assetId: id, role: order ? "detail" : "main" }); });
  if (images.BG_IMAGE && !list.some(function (item) { return item.assetId === images.BG_IMAGE; })) list.unshift({ assetId: images.BG_IMAGE, role: "background" });
  return list;
}
/** 일반 이미지 슬롯 수(IMAGE_MAIN · IMAGE_1~4 각각, 배경 슬롯 제외). */
function generalImageSlots(slots) {
  return ["IMAGE_MAIN", "IMAGE_1", "IMAGE_2", "IMAGE_3", "IMAGE_4"].filter(function (slot) { return slots.indexOf(slot) >= 0; }).length;
}
/**
 * 템플릿에 있는 이미지 슬롯에 슬라이드 이미지를 배정한다. 같은 사진을 두 슬롯에 쓰지 않는다.
 * BG_IMAGE ← background 역할 이미지. 대표 슬롯이 없는 템플릿이면 대표 이미지(→ 첫 이미지).
 * IMAGE_MAIN ← 대표(main 역할 → 첫 이미지). IMAGE_1~4 ← 나머지 순서대로(각자 다른 사진, IMAGE_MAIN이 없으면 대표 이미지부터).
 * 배경(BG_IMAGE) ← background 역할 이미지 → 없으면 대표(MAIN) 이미지(대표 슬롯에 같은 사진이 들어가도) → 이미지가 하나도 없으면 단색.
 */
function mapTemplateImages(list, slots) {
  var pool = list.slice(), result = {};
  var take = function (item) { if (!item) return null; pool = pool.filter(function (other) { return other !== item; }); return item.assetId; };
  var byRole = function (role) { return pool.filter(function (item) { return item.role === role; })[0]; };
  var hasMain = slots.indexOf("IMAGE_MAIN") >= 0, hasBg = slots.indexOf("BG_IMAGE") >= 0;
  var numbered = ["IMAGE_1", "IMAGE_2", "IMAGE_3", "IMAGE_4"].filter(function (slot) { return slots.indexOf(slot) >= 0; });
  if (hasBg) result.BG_IMAGE = take(byRole("background"));
  var main = byRole("main") || pool.filter(function (item) { return item.role !== "background"; })[0] || pool[0];
  if (hasMain) result.IMAGE_MAIN = take(main);
  // IMAGE_1~4는 IMAGE_2처럼 각자 다른 사진 칸. IMAGE_MAIN이 없는 템플릿이면 대표 이미지가 첫 번호 칸에 들어간다.
  numbered.forEach(function (slot, index) {
    var pick = !hasMain && index === 0 && pool.indexOf(main) >= 0 ? main : pool.filter(function (item) { return item.role !== "background"; })[0] || pool[0];
    result[slot] = take(pick);
  });
  if (hasBg && !result.BG_IMAGE) result.BG_IMAGE = main ? main.assetId : null;
  return result;
}

/** 자동 선택: 슬라이드 유형(표지·본문·CTA) → 이미지 유무가 맞는 템플릿 → 바로 앞과 같은 템플릿·많이 쓴 템플릿은 피한다. */
function autoAssignTemplates(slides, inventory) {
  var names = Object.keys((inventory && inventory.templates) || {});
  var usage = {}, previous = null, result = {};
  (slides || []).forEach(function (unit, index) {
    var content = slideContent(unit, index, slides.length, {});
    var count = slideImageList(content).length;
    var candidates = names.filter(function (name) { return inventory.templates[name].kind === content.kind; });
    if (!candidates.length) { result[unit.id] = null; return; }
    var best = null, bestScore = Infinity;
    candidates.forEach(function (name) {
      var template = inventory.templates[name];
      var capable = template.imageSlots > 0 || Boolean(template.background);
      // 이미지 유무가 맞는지 → 비게 될 일반 이미지 슬롯 수(이미지 2장이면 2칸 템플릿이 맞음) → 쓰지 못하는 이미지 → 반복 회피.
      var capacity = template.imageSlots + (template.background && template.slots.indexOf("BG_IMAGE") >= 0 ? 1 : 0);
      var score = (capable === count > 0 ? 0 : 2) + Math.max(0, template.imageSlots - count) + (count > capacity ? 1 : 0) + (name === previous ? 3 : 0) + (usage[name] || 0);
      if (score < bestScore) { best = name; bestScore = score; }
    });
    result[unit.id] = best;
    usage[best] = (usage[best] || 0) + 1;
    previous = best;
  });
  return result;
}

/** 자동 배정을 설명한다: 유형별 슬라이드 수와 템플릿 수로 한 번에 쓸 수 있는 최대 종류. */
function explainAssignment(slides, inventory, assignments) {
  var counts = { COVER: 0, BODY: 0, CTA: 0 }, available = { COVER: 0, BODY: 0, CTA: 0 };
  (slides || []).forEach(function (unit) { counts[slideKind(unit.type)] += 1; });
  Object.keys((inventory && inventory.templates) || {}).forEach(function (name) { available[inventory.templates[name].kind] += 1; });
  var possible = ["COVER", "BODY", "CTA"].reduce(function (sum, kind) { return sum + Math.min(counts[kind], available[kind]); }, 0);
  var used = Object.keys(assignments || {}).map(function (id) { return assignments[id]; }).filter(Boolean).filter(function (name, index, all) { return all.indexOf(name) === index; });
  return "슬라이드 " + (slides || []).length + "장 = 표지 " + counts.COVER + " · 본문 " + counts.BODY + " · CTA " + counts.CTA + " → 템플릿은 종류별로 슬라이드 수만큼만 쓰일 수 있어 최대 " + possible + "종(인식된 템플릿 " + Object.keys((inventory && inventory.templates) || {}).length + "종). 이번 배정 " + used.length + "종.";
}

/** 사용자가 고른 템플릿이 있으면 그것(인식된 템플릿일 때만), 없으면 자동 선택. */
function resolveAssignments(slides, inventory, chosen) {
  var auto = autoAssignTemplates(slides, inventory);
  var result = {};
  (slides || []).forEach(function (unit) {
    // 플러그인에서 고른 것 → 웹(Content Studio)에서 고른 템플릿(slide.template.templateId) → 자동.
    var pick = (chosen && chosen[unit.id]) || (unit.template && unit.template.templateId);
    result[unit.id] = pick && pick !== "AUTO" && inventory.templates[pick] ? pick : auto[unit.id];
  });
  return result;
}

/** 텍스트 플레이스홀더 하나. 빈 내용이거나 글꼴이 없어 고칠 수 없으면 견본 문구가 남지 않게 숨긴다. */
async function setTemplateText(api, node, value, report, label, options) {
  if (!value) { node.visible = false; report.hiddenSlots.push(label); return; }
  var fonts = textFonts(api, node);
  var failed = await failedFonts(api, fonts, options.fontCache);
  if (node.hasMissingFont || failed.length) {
    var names = (failed.length ? failed : fonts.map(fontLabel)).join(", ");
    if (!options.fontFallback) {
      // 템플릿 글꼴은 사용자 승인 없이 바꾸지 않는다. 고칠 수 없으니 견본 문구가 결과물에 남지 않게 숨긴다.
      node.visible = false;
      node.setPluginData(TEMPLATE_KEY, JSON.stringify({ missingFonts: failed.length ? failed : fonts.map(fontLabel), hidden: true }));
      report.fontMissing.push(label + " (" + names + ")");
      return;
    }
    var fallback = await loadFont(api, { family: options.fontFallback.family, fallback: KOREAN_FONT, style: options.fontFallback.style || "Regular" }, report);
    node.fontName = fallback;
    report.fontReplaced.push(label + " (" + names + " → " + fontLabel(fallback) + ")");
  }
  var before = { mode: node.textAutoResize, width: node.width, height: node.height, size: node.fontSize };
  node.characters = String(value);
  report.texts += 1;
  if (before.mode === "WIDTH_AND_HEIGHT") return;
  // 고정 상자의 넘침을 재려면 잠시 높이 자동으로 바꿔 실제 높이를 본다.
  node.textAutoResize = "HEIGHT";
  var height = node.height, fitted = false;
  if (height > before.height + 1 && typeof before.size === "number") {
    var min = Math.max(MIN_TEMPLATE_FONT, Math.round(before.size * TEMPLATE_SHRINK));
    for (var size = before.size - 1; size >= min && height > before.height + 1; size -= 1) { node.fontSize = size; height = node.height; fitted = true; }
  }
  var overflow = height > before.height + 1;
  node.textAutoResize = before.mode;
  if (before.mode === "NONE" || before.mode === "TRUNCATE") node.resize(before.width, before.height);
  if (fitted) report.fitted += 1;
  if (overflow) { report.overflows.push(label); node.setPluginData(TEMPLATE_KEY, JSON.stringify({ overflow: true })); }
}

function offsetWithin(node, root) {
  var x = 0, y = 0, current = node;
  while (current && current !== root) { x += current.x || 0; y += current.y || 0; current = current.parent; }
  return { x: x, y: y };
}

/** 슬롯 위 표시(복제본에만): "AI 생성 이미지" 또는 이미지를 넣지 못한 이유. 자동 레이아웃 프레임이면 흐름을 깨지 않게 절대 위치로 둔다. */
async function addSlotLabel(api, slot, clone, report, content, dark) {
  var font = await loadFont(api, { family: KOREAN_FONT, fallback: KOREAN_FONT, style: "Bold" }, report);
  var text = api.createText();
  text.fontName = font; text.fontSize = Math.max(14, Math.round(clone.width / 54)); text.characters = content; text.fills = solid(dark ? "#FFFFFF" : "#3A3D4A");
  text.name = (dark ? "AI 생성 표시" : "이미지 없음 표시") + " · 글자";
  var bg = api.createRectangle();
  bg.resize(text.width + 16, text.height + 8); bg.fills = solid(dark ? "#14161F" : "#FFFFFF", dark ? 0.72 : 0.9); bg.cornerRadius = 6; bg.name = dark ? "AI 생성 표시" : "이미지 없음 표시";
  var pos = offsetWithin(slot, clone);
  [bg, text].forEach(function (node) { clone.appendChild(node); if (clone.layoutMode && clone.layoutMode !== "NONE") node.layoutPositioning = "ABSOLUTE"; });
  bg.x = dark ? pos.x + slot.width - bg.width - 12 : pos.x + 12; bg.y = pos.y + 12;
  text.x = bg.x + 8; text.y = bg.y + 4;
}

/**
 * 이미지 플레이스홀더 하나. 템플릿의 IMAGE 채우기 자리에 넣고(없으면 맨 아래), 그라데이션·오버레이 채우기는 그 위에 그대로 둔다.
 * 넣지 못하면 견본 사진만 회색으로 바꾸고(다른 채우기는 유지) 이유를 슬롯 위에 적는다.
 * 배경 슬롯(background: 대체 색)은 회색 자리표시 대신 단색으로 채운다(투명·체크보드가 남지 않게). 이미지는 FILL(꽉 채움·비율 유지).
 */
async function setTemplateImage(api, plan, layer, assetId, images, report, label, clone, failedImages, background) {
  var target = imageTarget(layer);
  if (!target) { report.imageNeeded.push(label + ": 이미지를 채울 레이어가 없음(" + layer.type + ")"); return; }
  var asset = assetId ? plan.assets[assetId] : null;
  var bytes = assetId ? images[assetId] : null;
  var fills = target.fills.slice();
  var at = fills.findIndex(function (paint) { return paint.type === "IMAGE"; });
  if (asset && asset.status !== "REAL REFERENCE" && bytes) {
    var image = api.createImage(bytes);
    var paint = { type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" };
    var base = imageBase(fills);
    var next = base.kind === "image" ? fills.map(function (item) { return item.type === "IMAGE" ? paint : item; }) : base.kind === "solid" ? fills.map(function (item, index) { return index === 0 ? paint : item; }) : [paint].concat(fills);
    if (base.kind === "solid") report.imageBase.push(label);
    target.fills = next;
    target.setPluginData(TEMPLATE_KEY, JSON.stringify({ assetId: assetId, status: asset.status }));
    report.images += 1;
    var above = next.slice(next.indexOf(paint) + 1);
    if (coversImage(above)) report.imageCovered.push(label);
    await addSlotLabel(api, target, clone, report, "AI 생성 이미지", true);
    return;
  }
  var reason = !assetId ? "no-link" : !asset ? "unknown-asset" : asset.status === "REAL REFERENCE" ? "reference" : "not-received";
  var detail = IMAGE_REASONS[reason] + (reason === "not-received" && failedImages && failedImages[assetId] ? " · " + failedImages[assetId] : "");
  if (assetId && typeof console !== "undefined") console.warn("[TREND RADAR] " + label + " 이미지 없음: " + detail + " (asset " + assetId + ")");
  if (background) {
    var color = { type: "SOLID", color: background.color };
    var spot = imageBase(fills);
    target.fills = spot.kind === "image" ? fills.map(function (item) { return item.type === "IMAGE" ? color : item; }) : spot.kind === "solid" ? fills.map(function (item, index) { return index === 0 ? color : item; }) : [color].concat(fills);
    target.setPluginData(TEMPLATE_KEY, JSON.stringify({ assetId: assetId || null, missing: reason, fallback: background.hex }));
    if (reason === "reference") report.references += 1;
    report.backgroundFallbacks.push(label + ": 단색 " + background.hex + "(" + background.source + ") · " + (reason === "no-link" ? "배경에 쓸 이미지 없음" : detail));
    return;
  }
  if (at >= 0) target.fills = fills.map(function (item) { return item.type === "IMAGE" ? { type: "SOLID", color: hexToRgb("#E9EBF2") } : item; });
  target.setPluginData(TEMPLATE_KEY, JSON.stringify({ assetId: assetId || null, missing: reason }));
  if (reason === "reference") report.references += 1; else report.missing += 1;
  report.imageNeeded.push(label + ": " + detail);
  await addSlotLabel(api, target, clone, report, "이미지 없음 · " + IMAGE_REASONS[reason].split("(")[0], false);
}

/** MY TEMPLATES 출력. 템플릿 페이지에서 실행하면 새 페이지에, 아니면 현재 페이지 기존 노드 오른쪽에 만든다. */
async function renderTemplates(api, data, plan, images, options) {
  images = images || {};
  options = options || {};
  var report = { frames: 0, texts: 0, images: 0, references: 0, missing: 0, fontFallbacks: {}, failedFrames: [], overflows: [], fitted: 0, mode: "templates", templatesUsed: [], hiddenSlots: [], fontMissing: [], fontReplaced: [], imageNeeded: [], imageCovered: [], imageBase: [], backgroundFallbacks: [], frameBackgrounds: [], imagesUnused: [], fallbackSlides: [], outputPage: null, problems: [], assignmentNote: "" };
  var inventory = options.inventory || await scanTemplates(api);
  report.problems = inventory.problems.slice();
  var found = findTemplatePage(api);
  var sources = {};
  if (found.page) (found.page.children || []).forEach(function (node) { if (inventory.templates[node.name] && !sources[node.name]) sources[node.name] = node; });
  if (found.page && api.currentPage === found.page) {
    var out = api.createPage();
    out.name = "TREND RADAR · " + ((data.project && data.project.title) || "카드뉴스");
    if (api.setCurrentPageAsync) await api.setCurrentPageAsync(out); else api.currentPage = out;
    report.outputPage = out.name;
  }
  var slides = data.slides || [];
  var assignments = resolveAssignments(slides, inventory, options.assignments);
  report.assignmentNote = explainAssignment(slides, inventory, assignments);
  var textOptions = { fontCache: {}, fontFallback: options.fontFallback || null };
  var prefix = options.code ? "TR " + options.code + " · " : "";
  var origin = placementOrigin(api, plan);
  var x = origin.x, created = [];
  for (var i = 0; i < slides.length; i += 1) {
    var unit = slides[i];
    var name = assignments[unit.id];
    var source = name ? sources[name] : null;
    if (!source) {
      var spec = Object.assign({}, plan.frames[i], { x: 0 });
      var collect = [];
      var sub = await renderPlan(api, Object.assign({}, plan, { frames: [spec], publishing: null, notes: null }), images, { origin: { x: x, y: origin.y }, skipSides: true, keepSelection: true, collect: collect, handoffId: options.handoffId, code: options.code });
      ["frames", "texts", "images", "references", "missing", "fitted"].forEach(function (key) { report[key] += sub[key]; });
      report.failedFrames = report.failedFrames.concat(sub.failedFrames); report.overflows = report.overflows.concat(sub.overflows);
      report.fallbackSlides.push(pad2(i + 1) + " (" + slideKind(unit.type) + " 템플릿 없음 → AUTO DESIGN)");
      created = created.concat(collect);
      x += spec.width + FRAME_GAP;
      continue;
    }
    var clone = null;
    try {
      clone = source.type === "COMPONENT" ? source.createInstance().detachInstance() : source.clone();
      api.currentPage.appendChild(clone);
      clone.x = x; clone.y = origin.y;
      clone.name = prefix + pad2(i + 1) + " · " + name;
      clone.setPluginData("trend-radar", JSON.stringify(Object.assign({}, plan.frames[i] ? plan.frames[i].pluginData : { slideId: unit.id }, { template: name })));
      if (options.handoffId) clone.setPluginData(HANDOFF_KEY, options.handoffId);
      var content = slideContent(unit, i, slides.length, data.project);
      var layers = descendants(clone).map(function (node) { return { node: node, slot: slotOf(node) }; }).filter(function (item) { return item.slot; });
      var imageList = slideImageList(content);
      var assigned = mapTemplateImages(imageList, layers.map(function (item) { return item.slot.slot; }));
      var unused = imageList.filter(function (entry) { return Object.keys(assigned).every(function (key) { return assigned[key] !== entry.assetId; }); });
      if (unused.length) report.imagesUnused.push(pad2(i + 1) + " " + name + ": 이미지 " + imageList.length + "장 중 " + unused.length + "장(" + unused.map(function (entry) { return entry.assetId; }).join(", ") + ")을 넣을 이미지 슬롯이 없음 — IMAGE_MAIN·IMAGE_2·BG_IMAGE가 있는 템플릿을 고르세요");
      var fallback = backgroundFallback(clone, (data.project && data.project.palette) || null);
      for (var t = 0; t < layers.length; t += 1) {
        var item = layers[t], slot = item.slot.slot, tag = pad2(i + 1) + " " + slot;
        if (TEXT_SLOTS.indexOf(slot) >= 0) { if (item.node.type === "TEXT") await setTemplateText(api, item.node, content.fields[slot], report, tag, textOptions); }
        else await setTemplateImage(api, plan, item.node, assigned[slot] || null, images, report, tag, clone, options.failedImages, isBackgroundSlot(slot, item.node, clone) ? fallback : null);
      }
      // 프레임 자체가 투명하면(체크보드) 복제본에만 대체 색을 깐다.
      if (!opaqueSolid(clone.fills) && !(clone.fills || []).some(function (paint) { return paint.type === "IMAGE" && paint.visible !== false; })) {
        clone.fills = [{ type: "SOLID", color: fallback.color }].concat(Array.isArray(clone.fills) ? clone.fills : []);
        report.frameBackgrounds.push(pad2(i + 1) + " " + name + ": 단색 " + fallback.hex + "(" + fallback.source + ")");
      }
      created.push(clone);
      report.frames += 1;
      report.templatesUsed.push(pad2(i + 1) + " " + name);
      x += clone.width + FRAME_GAP;
    } catch (error) {
      if (clone && clone.remove) { try { clone.remove(); } catch (ignored) { void ignored; } }
      report.failedFrames.push({ name: pad2(i + 1) + " · " + name, error: String(error && error.message ? error.message : error) });
    }
  }
  if (options.previewOnly) return report; // 임시 렌더링: NOTES 프레임·선택·화면 이동 없음
  var sides = [];
  var sideReport = await renderPlan(api, Object.assign({}, plan, { frames: [] }), images, { origin: origin, keepSelection: true, collect: sides, handoffId: options.handoffId, code: options.code });
  Object.keys(sideReport.fontFallbacks).forEach(function (key) { report.fontFallbacks[key] = sideReport.fontFallbacks[key]; });
  created = sides.concat(created);
  api.currentPage.selection = created;
  if (api.viewport && api.viewport.scrollAndZoomIntoView) api.viewport.scrollAndZoomIntoView(created);
  return report;
}

/* ---------- MY TEMPLATES 동기화(P10) · 변경 감지(P15) · 렌더링 미리보기(P13) ---------- */
var THUMB_WIDTHS = [480, 320];
var TEMPLATE_PNG_MAX_BYTES = 1400000;
var PREVIEW_PAGE = "TREND RADAR · 미리보기(임시, 자동 삭제)";
/** FNV-1a 두 갈래(웹 lib/figma-templates.ts의 fnv64와 같은 계산). */
function fnv64(text) {
  var a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (var i = 0; i < text.length; i += 1) { var code = text.charCodeAt(i); a = Math.imul(a ^ code, 0x01000193) >>> 0; b = Math.imul(b ^ code, 0x5bd1e995) >>> 0; }
  return ("0000000" + a.toString(16)).slice(-8) + ("0000000" + b.toString(16)).slice(-8);
}
function signature(api, value) { return value === undefined ? "" : api && value === api.mixed ? "mixed" : typeof value === "object" ? JSON.stringify(value) : String(value); }
/** 템플릿 디자인 지문: 레이어 이름·종류·위치·크기·보임·칠·선·글자·글꼴. 바뀌면 웹 썸네일이 이전 디자인이라는 뜻이다(읽기만 한다). */
function designHash(api, node) {
  var rows = [node].concat(descendants(node)).map(function (item) {
    return [item.name, item.type, Math.round(item.x || 0), Math.round(item.y || 0), Math.round(item.width || 0), Math.round(item.height || 0), item.visible !== false, item.opacity === undefined ? 1 : item.opacity,
      signature(api, item.fills), signature(api, item.strokes), item.type === "TEXT" ? signature(api, item.characters) : "", item.type === "TEXT" ? signature(api, item.fontName) : "", item.type === "TEXT" ? signature(api, item.fontSize) : ""].join("|");
  });
  return fnv64(rows.join("\n"));
}
/** 템플릿 프레임을 PNG로 내보낸다(exportAsync는 원본을 바꾸지 않는다). 너무 크면 더 작게 한 번 더. */
async function exportTemplateThumbnails(api, inventory) {
  var found = findTemplatePage(api);
  if (!found.page) return [];
  var out = [];
  var names = Object.keys(inventory.templates);
  for (var i = 0; i < names.length; i += 1) {
    var name = names[i], info = inventory.templates[name];
    var node = (found.page.children || []).filter(function (item) { return item.name === name; })[0];
    var meta = { templateId: name, name: name, width: Math.round(info.width), height: Math.round(info.height), fileKey: api.fileKey || null, fileName: (api.root && api.root.name) || "", nodeId: node ? node.id : "?",
      placeholders: { slots: info.slots, imageSlots: info.imageSlots, background: info.background, summary: info.summary, warnings: info.warnings.slice(0, 30) }, designHash: info.designHash };
    try {
      if (!node || !node.exportAsync) throw new Error("이 Figma 환경에서는 PNG로 내보낼 수 없습니다.");
      var bytes = null;
      for (var w = 0; w < THUMB_WIDTHS.length && (!bytes || bytes.length > TEMPLATE_PNG_MAX_BYTES); w += 1) bytes = await node.exportAsync({ format: "PNG", constraint: { type: "WIDTH", value: Math.min(THUMB_WIDTHS[w], Math.round(info.width)) } });
      if (!bytes || bytes.length > TEMPLATE_PNG_MAX_BYTES) throw new Error("썸네일이 너무 큽니다(1.4MB 초과).");
      out.push({ ok: true, template: meta, bytes: bytes });
    } catch (error) {
      out.push({ ok: false, template: meta, error: String(error && error.message ? error.message : error).slice(0, 400) });
    }
  }
  return out;
}
/**
 * 실제 콘텐츠를 넣은 렌더링 미리보기. 임시 페이지에 복제본을 만들어 PNG로 내보낸 뒤 그 페이지를 지운다(원본 템플릿·다른 페이지는 그대로).
 * 템플릿 없이 AUTO DESIGN으로 그린 슬라이드는 미리보기에서 뺀다.
 */
async function renderTemplatePreviews(api, data, plan, images, options) {
  var original = api.currentPage;
  var temp = api.createPage();
  temp.name = PREVIEW_PAGE;
  var items = [], skipped = [], report = null;
  try {
    await api.setCurrentPageAsync(temp);
    report = await renderTemplates(api, data, plan, images, Object.assign({}, options || {}, { previewOnly: true }));
    var frames = (temp.children || []).map(function (node) { var meta = {}; try { meta = JSON.parse(node.getPluginData("trend-radar") || "{}"); } catch (ignored) { void ignored; } return { node: node, meta: meta }; });
    var slides = data.slides || [];
    for (var i = 0; i < slides.length; i += 1) {
      var unit = slides[i];
      var frame = frames.filter(function (item) { return item.meta.slideId === unit.id && item.meta.template; })[0];
      if (!frame) { skipped.push(pad2(i + 1) + " (템플릿 없이 AUTO DESIGN)"); continue; }
      try {
        var bytes = await frame.node.exportAsync({ format: "PNG", constraint: { type: "WIDTH", value: Math.min(THUMB_WIDTHS[0], Math.round(frame.node.width)) } });
        if (bytes.length > TEMPLATE_PNG_MAX_BYTES) bytes = await frame.node.exportAsync({ format: "PNG", constraint: { type: "WIDTH", value: THUMB_WIDTHS[1] } });
        items.push({ slideId: unit.id, templateId: frame.meta.template, previewKey: (unit.template && unit.template.previewKey) || "", bytes: bytes });
      } catch (error) { skipped.push(pad2(i + 1) + " (PNG 내보내기 실패: " + String(error && error.message ? error.message : error).slice(0, 120) + ")"); }
    }
  } finally {
    if (original && api.setCurrentPageAsync) await api.setCurrentPageAsync(original);
    if (temp.remove) temp.remove();
  }
  return { items: items, skipped: skipped, report: report };
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
    if (message.type === "scan-templates") { figma.ui.postMessage({ type: "templates", inventory: await scanTemplates(figma) }); return; }
    if (message.type === "suggest-templates") { var scanned = await scanTemplates(figma); var auto = autoAssignTemplates(message.slides || [], scanned); figma.ui.postMessage({ type: "assignments", assignments: auto, note: explainAssignment(message.slides || [], scanned, auto) }); return; }
    if (message.type === "sync-templates") {
      var inventory = await scanTemplates(figma);
      figma.ui.postMessage({ type: "template-thumbnails", items: await exportTemplateThumbnails(figma, inventory), missing: inventory.missing, problems: inventory.problems });
      return;
    }
    if (message.type === "render-previews") {
      try {
        var previewPlan = buildFigmaPlan(message.data);
        if (previewPlan.errors.length) { figma.ui.postMessage({ type: "error", code: "INVALID", message: previewPlan.errors.join("\n") }); return; }
        var rendered = await renderTemplatePreviews(figma, message.data, previewPlan, message.images || {}, { assignments: message.assignments || {}, fontFallback: message.fontFallback || null, failedImages: message.failed || {} });
        figma.ui.postMessage({ type: "previews-rendered", items: rendered.items, skipped: rendered.skipped, report: rendered.report });
      } catch (error) { figma.ui.postMessage({ type: "error", code: "RENDER", message: "미리보기 렌더링 실패: " + String(error && error.message ? error.message : error) }); }
      return;
    }
    if (message.type !== "build") return;
    try {
      var data = message.data;
      if (message.handoffId && (!data || !data.handoff || data.handoff.id !== message.handoffId)) { figma.ui.postMessage({ type: "error", code: "INVALID", message: "받은 데이터가 선택한 작업과 다릅니다. 다시 불러오세요." }); return; }
      var plan = buildFigmaPlan(data);
      if (plan.errors.length) { figma.ui.postMessage({ type: "error", code: "INVALID", message: plan.errors.join("\n") }); return; }
      var already = existingImports(figma, message.handoffId);
      if (already && !message.force) { figma.ui.postMessage({ type: "exists", count: already }); return; }
      var report = message.mode === "templates"
        ? await renderTemplates(figma, data, plan, message.images || {}, { handoffId: message.handoffId, code: message.code, assignments: message.assignments || {}, fontFallback: message.fontFallback || null, failedImages: message.failed || {} })
        : await renderPlan(figma, plan, message.images || {}, { handoffId: message.handoffId, code: message.code });
      figma.ui.postMessage({ type: "done", report: report, failedImages: message.failed || {} });
      figma.notify(report.failedFrames.length ? "일부 슬라이드를 만들지 못했습니다 · " + report.frames + "/" + plan.frames.length : "Figma에 편집 가능한 카드뉴스가 생성되었습니다.");
    } catch (error) {
      figma.ui.postMessage({ type: "error", code: "RENDER", message: String(error && error.message ? error.message : error) });
    }
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = { designHash: designHash, exportTemplateThumbnails: exportTemplateThumbnails, renderTemplatePreviews: renderTemplatePreviews, fnv64: fnv64, mapTemplateImages: mapTemplateImages, slideImageList: slideImageList, backgroundFallback: backgroundFallback, isBackgroundSlot: isBackgroundSlot, explainAssignment: explainAssignment, slotOf: slotOf, imageTarget: imageTarget, TEMPLATE_NAMES: TEMPLATE_NAMES, scanTemplates: scanTemplates, autoAssignTemplates: autoAssignTemplates, resolveAssignments: resolveAssignments, renderTemplates: renderTemplates, slideContent: slideContent, SCHEMA: SCHEMA, HANDOFF_KEY: HANDOFF_KEY, renderSceneElement: renderSceneElement, buildFigmaPlan: buildFigmaPlan, imageRequests: imageRequests, renderPlan: renderPlan, existingImports: existingImports, placementOrigin: placementOrigin, hexToRgb: hexToRgb };
