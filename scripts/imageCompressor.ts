import imagemin from 'imagemin';
import imageminJpegtran from 'imagemin-jpegtran';
import imageminPngquant from 'imagemin-pngquant';
import imageminSvgo from 'imagemin-svgo';
import imageminWebp from 'imagemin-webp';

export async function compressImage(inputBuffer, outputPath) {
  try {
    const plugins = [
      imageminJpegtran(),
      imageminPngquant({
        quality: [0.6, 0.8]
      }),
      imageminSvgo({
        plugins: [
          {
            name: 'removeViewBox',
            active: false
          }
        ]
      }),
      imageminWebp({ quality: 75 })
    ];

    const compressedBuffer = await imagemin.buffer(inputBuffer, { plugins });
    return { compressedBuffer, originalSize: inputBuffer.length, compressedSize: compressedBuffer.length };
  } catch (error) {
    console.error('Error compressing image:', error);
    throw error;
  }
}
