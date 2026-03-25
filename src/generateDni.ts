// ═══════════════════════════════════════════════════════════════════════════
// generateDni.ts — Avatar siempre fresco desde Roblox API
// ═══════════════════════════════════════════════════════════════════════════
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import path from "path";
import fs from "fs";

const TEMPLATE_PATH = path.join(process.cwd(), "assets", "dni_template.png");
const FONT_PATH     = path.join(process.cwd(), "assets", "font.ttf");

// ── Posiciones exactas del template ──────────────────────────────────────────
const POS = {
  foto:             { x: 25,  y: 93,  w: 220, h: 230 },
  apellido:         { x: 280, y: 150 },
  nombre:           { x: 280, y: 215 },
  nacionalidad:     { x: 565, y: 181 },
  sexo:             { x: 280, y: 273 },
  fecha_nacimiento: { x: 280, y: 345 },
  fecha_emision:    { x: 565, y: 283 },
  documento:        { x: 119, y: 405 },
};

/**
 * Obtiene una URL de avatar FRESCA desde la API de Roblox usando el username.
 * Esto evita el problema de URLs expiradas guardadas en la base de datos.
 */
export async function getFreshAvatarUrl(robloxUsername: string): Promise<string> {
  try {
    // Paso 1: obtener el userId desde el username
    const userRes = await fetch("https://users.roblox.com/v1/usernames/users", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ usernames: [robloxUsername], excludeBannedUsers: false }),
    });
    if (!userRes.ok) return "";
    const userData = await userRes.json() as any;
    if (!userData.data || userData.data.length === 0) return "";
    const userId = userData.data[0].id as number;

    // Paso 2: obtener la URL del avatar bust (busto, como en los DNIs)
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-bust?userIds=${userId}&size=420x420&format=Png&isCircular=false`
    );
    if (!thumbRes.ok) return "";
    const thumbData = await thumbRes.json() as any;
    const freshUrl  = thumbData.data?.[0]?.imageUrl ?? "";
    return freshUrl;
  } catch (e) {
    console.error(`Error obteniendo avatar fresco para ${robloxUsername}:`, e);
    return "";
  }
}

/**
 * Descarga el avatar desde una URL y lo retorna como canvas procesado.
 * Elimina el fondo blanco/gris típico de Roblox.
 */
async function fetchAndProcessAvatar(avatarUrl: string) {
  if (!avatarUrl || !avatarUrl.startsWith("http")) return null;

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(avatarUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal:  controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`Avatar HTTP ${res.status}`);
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "";
    const validTypes  = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.some((t) => contentType.includes(t))) {
      console.error(`Tipo de imagen no soportado: ${contentType}`);
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;

    const img = await loadImage(buf);
    const tmp = createCanvas(img.width, img.height);
    const ctx = tmp.getContext("2d");
    ctx.drawImage(img, 0, 0);

    // Eliminar fondo blanco/gris
    const imageData = ctx.getImageData(0, 0, tmp.width, tmp.height);
    const data      = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 220 && g > 220 && b > 220) data[i + 3] = 0;
    }
    ctx.putImageData(imageData, 0, 0);
    return tmp;

  } catch (e: any) {
    if (e?.name === "AbortError") {
      console.error("Timeout al cargar avatar");
    } else {
      console.error("Error al cargar avatar:", e?.message ?? e);
    }
    return null;
  }
}

/**
 * Genera la imagen del DNI y retorna un Buffer PNG.
 * Siempre obtiene el avatar fresco desde Roblox usando el username.
 */
export async function generateDniImage(
  apellido:       string,
  nombre:         string,
  nacionalidad:   string,
  sexo:           string,
  fechaNac:       string,
  fechaEmision:   string,
  documento:      number,
  robloxUsername: string,   // <-- ahora usamos el username, no la URL guardada
): Promise<Buffer> {

  // Descargar fuente si no existe
  if (!fs.existsSync(FONT_PATH)) {
    console.log("Descargando fuente...");
    const res = await fetch("https://github.com/google/fonts/raw/main/apache/roboto/static/Roboto-Bold.ttf");
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(FONT_PATH, buf);
    console.log("Fuente descargada correctamente.");
  }
  GlobalFonts.registerFromPath(FONT_PATH, "DNIFont");

  // Cargar template
  const template = await loadImage(TEMPLATE_PATH);
  const canvas   = createCanvas(template.width, template.height);
  const ctx      = canvas.getContext("2d");
  ctx.drawImage(template, 0, 0);

  // Obtener avatar FRESCO desde Roblox
  if (robloxUsername) {
    const freshUrl = await getFreshAvatarUrl(robloxUsername);
    if (freshUrl) {
      const avatar = await fetchAndProcessAvatar(freshUrl);
      if (avatar) {
        const { x, y, w, h } = POS.foto;
        const MARGIN = 5;
        const scale  = Math.min((w - MARGIN * 2) / avatar.width, (h - MARGIN * 2) / avatar.height);
        const nw     = Math.floor(avatar.width  * scale);
        const nh     = Math.floor(avatar.height * scale);
        const ox     = x + Math.floor((w - nw) / 2);
        const oy     = y + Math.floor((h - nh) / 2);
        ctx.drawImage(avatar, ox, oy, nw, nh);
      }
    }
  }

  // Texto
  ctx.fillStyle = "#000000";

  ctx.font = "bold 24px DNIFont, Arial, sans-serif";
  ctx.fillText(apellido,     POS.apellido.x,         POS.apellido.y);
  ctx.fillText(nombre,       POS.nombre.x,           POS.nombre.y);
  ctx.fillText(nacionalidad, POS.nacionalidad.x,      POS.nacionalidad.y);
  ctx.fillText(sexo,         POS.sexo.x,             POS.sexo.y);
  ctx.fillText(fechaNac,     POS.fecha_nacimiento.x,  POS.fecha_nacimiento.y);
  ctx.fillText(fechaEmision, POS.fecha_emision.x,     POS.fecha_emision.y);

  ctx.font = "bold 28px DNIFont, Arial, sans-serif";
  ctx.fillText(String(documento), POS.documento.x, POS.documento.y);

  return canvas.toBuffer("image/png");
}
