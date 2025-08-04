import stream from 'stream';
import sharp from 'sharp';

const streamToBuffer = (stream): Promise<Buffer> => {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		stream.on('data', (chunk)=> chunks.push(chunk));
		stream.on('end', () => resolve(Buffer.concat(chunks)));
		stream.on('error', reject);
	});
};

export type ApplyOverlayToImageOptions = {
	resize?: {width: number, height: number};
};

export const applyOverlayToImage = async (inputImage: stream.Readable, overlayImage: sharp.Sharp, options?: ApplyOverlayToImageOptions): Promise<{image:sharp.Sharp}> => {
	// Convert the stream to a buffer first to inspect dimensions
	const baseBuffer = await streamToBuffer(inputImage);
	const baseImage = await sharp(baseBuffer);
	const baseMeta = await baseImage.metadata();
	const size = options?.resize ? options.resize : {width:baseMeta.width, height:baseMeta.height};

	// Resize overlay to match base image dimensions
	const resizedOverlay = await overlayImage
		.resize(size.width, size.height, {
			fit: 'fill',
		})
		.toBuffer();
	
	// Composite the resized overlay onto the base image
	let output = baseImage;
	if(options?.resize) {
		output = output.resize(options.resize.width, options.resize.height);
	}
	output = output.composite([{
			input: resizedOverlay,
			top: 0,
			left: 0
		}]);
	return {image:output};
};
