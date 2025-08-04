import stream from 'stream';
import sharp from 'sharp';

export const getImageLoader = (imagePath: string) => {
	const fullPath = imagePath.startsWith('/')
		? imagePath
		: `${require.main!.path}/../${imagePath}`;
	let imagePromise: Promise<{image: sharp.Sharp}> | undefined;
	let image: sharp.Sharp | undefined;
	return () => {
		if(image) {
			return {image};
		}
		if(imagePromise) {
			return imagePromise;
		}
		imagePromise = (async (): Promise<{image:sharp.Sharp}> => {
			try {
				image = await sharp(fullPath);
			} finally {
				imagePromise = undefined;
			}
			return {image};
		})();
		return imagePromise;
	};
};

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
	let output = baseImage
		.composite([{
			input: resizedOverlay,
			top: 0,
			left: 0
		}]);
	if(options?.resize) {
		output = output.resize(options.resize.width, options.resize.height);
	}
	return {image:output};
};
