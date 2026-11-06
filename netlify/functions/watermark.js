const Jimp = require('jimp');

exports.handler = async (event, context) => {
  try {
    // 1. Recoger la URL de la imagen original de la query (?img=...)
    const imageUrl = event.queryStringParameters.img;
    if (!imageUrl) {
      return { statusCode: 400, body: 'Falta el parámetro img' };
    }

    // 2. URL de tu logo transparente (la que usas en el header/footer)
    const watermarkUrl = "https://raw.githubusercontent.com/JGFoto/jgfoto/refs/heads/main/assets/LogoWebTuFotoEnFoco.png";

    // 3. Descargar ambas imágenes a la vez para ir más rápido
    const [image, watermark] = await Promise.all([
      Jimp.read(imageUrl),
      Jimp.read(watermarkUrl)
    ]);

    // 4. Redimensionar el logo para que ocupe el 30% del ancho de la foto
    const logoWidth = image.bitmap.width * 0.3;
    watermark.resize(logoWidth, Jimp.AUTO);

    // 5. Calcular la posición (Centro de la imagen)
    // Ideal para fotos deportivas donde no quieres que la roben recortando la esquina
    const x = (image.bitmap.width - watermark.bitmap.width) / 2;
    const y = (image.bitmap.height - watermark.bitmap.height) / 2;

    // 6. Fusionar las imágenes (con 70% de opacidad para que no tape del todo la acción)
    image.composite(watermark, x, y, {
      mode: Jimp.BLEND_SOURCE_OVER,
      opacitySource: 0.7 
    });

    // 7. Convertir el resultado a JPEG optimizado
    const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);

    // 8. Devolver la imagen al navegador
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        // Esto le dice al navegador de los usuarios que guarde la imagen en caché durante 1 año
        // Así no consumes recursos de Netlify si recargan la página
        'Cache-Control': 'public, max-age=31536000, immutable' 
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };
    
  } catch (error) {
    console.error("Error en la marca de agua:", error);
    return { statusCode: 500, body: 'Error procesando la imagen.' };
  }
};