const Jimp = require('jimp');

exports.handler = async (event, context) => {
  try {
    const imageUrl = event.queryStringParameters.img;
    const aplicarMarca = event.queryStringParameters.marca !== 'false';
    
    if (!imageUrl) {
      return { statusCode: 400, body: 'Falta el parámetro img' };
    }

    const watermarkUrl = "https://raw.githubusercontent.com/JGFoto/jgfoto/refs/heads/main/assets/LogoWebTuFotoEnFoco.png";

    if (aplicarMarca) {
      // PROCESO COMPLETO: Descargar ambas, poner marca y devolver
      const [image, watermark] = await Promise.all([
        Jimp.read(imageUrl),
        Jimp.read(watermarkUrl)
      ]);

      const logoWidth = image.bitmap.width * 0.3;
      watermark.resize(logoWidth, Jimp.AUTO);
      const x = (image.bitmap.width - watermark.bitmap.width) / 2;
      const y = (image.bitmap.height - watermark.bitmap.height) / 2;

      image.composite(watermark, x, y, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 0.7 
      });

      const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable' 
        },
        body: buffer.toString('base64'),
        isBase64Encoded: true
      };
      
    } else {
      // PROCESO LIMPIO: Si la columna S no está marcada, descargar original de Backblaze y devolverla sin logo
      const image = await Jimp.read(imageUrl);
      const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable' 
        },
        body: buffer.toString('base64'),
        isBase64Encoded: true
      };
    }
    
  } catch (error) {
    console.error("Error en la marca de agua:", error);
    return { statusCode: 500, body: 'Error procesando la imagen.' };
  }
};