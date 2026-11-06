import sharp from "sharp";

const BUCKET_HOST = "https://f003.backblazeb2.com";
const BUCKET_PREFIX = "/file/tufotoenfocogaleria/";
const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB

// MANTÉN TU BASE64 COMPLETO AQUÍ
const LOGO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAACAAAAAKsCAYAAAB4CV3rAAAQAElEQVR4Aez9CYBl11meC3...", "base64");

export default async (request) => {
  try {
    const requestUrl = new URL(request.url);
    const imagePath = requestUrl.searchParams.get("path");
    const watermark = requestUrl.searchParams.get("watermark") === "1";

    if (!imagePath || !watermark) {
      return new Response("Faltan parametros path o watermark", { status: 400 });
    }

    // Codificamos la ruta para que soporte espacios (ej: 'unga/foto 1.jpg' -> 'unga/foto%201.jpg')
    const encodedPath = imagePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const sourceUrl = `${BUCKET_HOST}${BUCKET_PREFIX}${encodedPath}`;

    let imageUrl;
    try { 
      imageUrl = new URL(sourceUrl); 
    } catch { 
      return new Response("Ruta de imagen no válida", { status: 400 }); 
    }

    const upstream = await fetch(imageUrl.toString(), { redirect: "follow" });
    if (!upstream.ok) {
      return new Response("No se pudo obtener la imagen original", { status: upstream.status });
    }

    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      return new Response("El recurso no es una imagen", { status: 415 });
    }

    const declaredLength = Number(upstream.headers.get("content-length") || 0);
    if (declaredLength > MAX_INPUT_BYTES) {
      return new Response("Imagen demasiado grande", { status: 413 });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const input = Buffer.from(arrayBuffer);
    
    if (input.length > MAX_INPUT_BYTES) {
      return new Response("Imagen demasiado grande", { status: 413 });
    }

    const metadata = await sharp(input, { animated: false }).metadata();
    if (!metadata.width || !metadata.height) {
      return new Response("Formato de imagen no compatible", { status: 415 });
    }

    const logoWidth = Math.max(1, Math.round(metadata.width * 0.70));
    
    const logoBuffer = await sharp(LOGO)
      .resize({ width: logoWidth, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();

    const logoMeta = await sharp(logoBuffer).metadata();
    
    const overlaySvg = Buffer.from(
      `<svg width="${logoMeta.width}" height="${logoMeta.height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
         <image xlink:href="data:image/png;base64,${logoBuffer.toString("base64")}" width="${logoMeta.width}" height="${logoMeta.height}" opacity="0.30"/>
       </svg>`
    );
    const overlay = await sharp(overlaySvg).png().toBuffer();

    const left = Math.max(0, Math.round((metadata.width - (logoMeta.width || logoWidth)) / 2));
    const top = Math.max(0, Math.round((metadata.height - (logoMeta.height || 1)) / 2));

    const output = await sharp(input, { animated: false })
      .composite([{ input: overlay, left: left, top: top }])
      .webp({ quality: 88 })
      .toBuffer();

    return new Response(output, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Error procesando imagen:", error);
    return new Response("Error procesando la imagen: " + error.message, { status: 500 });
  }
};