import imagemin from 'imagemin';
import imageminJpegtran from 'imagemin-jpegtran';
import imageminPngquant from 'imagemin-pngquant';
import imageminSvgo from 'imagemin-svgo';
import imageminWebp from 'imagemin-webp';
import { PNG_QUALITY_RANGE, WEBP_QUALITY } from './constants.js';

export async function compressImage(inputBuffer: Buffer) {
  try {
    const plugins = [
      imageminJpegtran(),
      imageminPngquant({
        quality: PNG_QUALITY_RANGE
      }),
      imageminSvgo({
        plugins: [
          {
            name: 'removeViewBox',
            active: false
          }
        ]
      }),
      imageminWebp({ quality: WEBP_QUALITY })
    ];

    const compressedBuffer = await imagemin.buffer(inputBuffer, { plugins });
    return { compressedBuffer, originalSize: inputBuffer.length, compressedSize: compressedBuffer.length };
  } catch (error) {
    console.error('Error compressing image:', error);
    throw error;
  }
}
