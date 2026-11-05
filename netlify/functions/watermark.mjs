import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";

const B2_BASE_URL = (
  process.env.B2_PUBLIC_BASE_URL ||
  "https://f003.backblazeb2.com/file/tufotoenfocogaleria"
).replace(/\/+$/, "");

const WATERMARK_PATH = path.join(
  process.cwd(),
  "netlify",
  "functions",
  "marcatufotoenfoco.png"
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function response(body, status, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, ...extraHeaders }
  });
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return response(null, 204);
  }
  if (request.method !== "GET") {
    return response("Método no permitido", 405, { "Allow": "GET, OPTIONS" });
  }

  const url = new URL(request.url);
  const relativePath = url.searchParams.get("path") || "";
  const applyWatermark = ["1", "true", "si", "sí"].includes(
    (url.searchParams.get("watermark") || "").toLowerCase()
  );

  // Solo admite rutas relativas sencillas dentro del bucket; nunca URLs externas.
  if (
    !relativePath ||
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    relativePath.split("/").some(part => !part || part === "." || part === "..") ||
    !/^[A-Za-z0-9._/-]+$/.test(relativePath) ||
    !/\.(jpe?g|png|webp)$/i.test(relativePath)
  ) {
    return response("Ruta de imagen no válida", 400);
  }

  const encodedPath = relativePath
    .split("/")
    .map(segment => encodeURIComponent(segment))
    .join("/");

  try {
    const upstream = await fetch(`${B2_BASE_URL}/${encodedPath}`, {
      redirect: "error"
    });

    if (!upstream.ok) {
      return response(
        upstream.status === 404 ? "Imagen no encontrada" : "No se pudo obtener la imagen",
        upstream.status === 404 ? 404 : 502,
        { "Cache-Control": "no-store" }
      );
    }

    const original = Buffer.from(await upstream.arrayBuffer());
    if (!original.length || original.length > 25 * 1024 * 1024) {
      return response("Tamaño de imagen no admitido", 413, { "Cache-Control": "no-store" });
    }

    const sourceType = (upstream.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!/^image\/(jpeg|png|webp)$/.test(sourceType)) {
      return response("El archivo de origen no es una imagen admitida", 415);
    }

    if (!applyWatermark) {
      return response(original, 200, {
        "Content-Type": sourceType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff"
      });
    }

    const watermark = await readFile(WATERMARK_PATH);
    const metadata = await sharp(original).metadata();
    if (!metadata.width || !metadata.height) {
      return response("No se pudo leer la imagen", 422);
    }

    // Ajusta las dimensiones cuando la orientación EXIF gira la fotografía.
    let width = metadata.width;
    let height = metadata.height;
    if ([5, 6, 7, 8].includes(metadata.orientation)) {
      [width, height] = [height, width];
    }

    const logoWidth = Math.max(80, Math.round(width * 0.26));
    const logo = await sharp(watermark)
      .resize({ width: logoWidth, withoutEnlargement: true })
      .png()
      .toBuffer();

    const logoMeta = await sharp(logo).metadata();
    const margin = Math.max(12, Math.round(width * 0.035));
    const left = Math.max(0, width - (logoMeta.width || 0) - margin);
    const top = Math.max(0, height - (logoMeta.height || 0) - margin);

    const processed = await sharp(original)
      .rotate()
      .composite([{ input: logo, left, top, blend: "over" }])
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();

    return response(processed, 200, {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff"
    });
  } catch (error) {
    return response("Error al procesar la imagen", 500, {
      "Cache-Control": "no-store"
    });
  }
};
