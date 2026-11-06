import sharp from "sharp";

const BUCKET_HOST = "f003.backblazeb2.com";
const BUCKET_PREFIX = "/file/tufotoenfocogaleria/";
const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB

// MANTÉN TU BASE64 COMPLETO AQUÍ (lo he acortado por legibilidad)
const LOGO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAACAAAAAKsCAYAAAB4CV3rAAAQAElEQVR4Aez9CYBl11meC3...", "base64");

export default async (request) => {
  try {
    const requestUrl = new URL(request.url);
    const source = requestUrl.searchParams.get("url");
    const watermark = requestUrl.searchParams.get("watermark") === "1";

    if (!source || !watermark) {
      return new Response("Falta url o watermark=1", { status: 400 });
    }

    let imageUrl;
    try { 
      imageUrl = new URL(source); 
    } catch { 
      return new Response("URL no válida", { status: 400 }); 
    }

    // Seguridad: Solo permite tu bucket de B2
    if (imageUrl.protocol !== "https:" ||
        imageUrl.hostname !== BUCKET_HOST ||
        !imageUrl.pathname.startsWith(BUCKET_PREFIX) ||
        imageUrl.username || imageUrl.password) {
      return new Response("Origen de imagen no permitido", { status: 403 });
    }

    // CORRECCIÓN 1: Permitir redirecciones, B2 a veces redirige entre nodos
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

    // Logo centrado: 70% del ancho de la imagen.
    const logoWidth = Math.max(1, Math.round(metadata.width * 0.70));
    
    const logoBuffer = await sharp(LOGO)
      .resize({ width: logoWidth, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();

    const logoMeta = await sharp(logoBuffer).metadata();
    
    // CORRECCIÓN 2: Uso de xmlns:xlink y xlink:href para evitar crashes de librsvg en Sharp
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