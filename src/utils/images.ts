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

export const applyOverlayToImage = async (inputImage: stream.Readable, overlayImageBuffer: Buffer, options?: ApplyOverlayToImageOptions): Promise<Buffer> => {
	let baseImage: sharp.Sharp | undefined;
	let resizedOverlayImage: sharp.Sharp | undefined;
	let outputBuffer: Buffer;
	try {
		// Convert the stream to a buffer first to inspect dimensions
		const baseBuffer = await streamToBuffer(inputImage);
		baseImage = sharp(baseBuffer);
		const baseMeta = await baseImage.metadata();
		const size = options?.resize ? options.resize : {width:baseMeta.width, height:baseMeta.height};
		const ratio = baseMeta.width / baseMeta.height;
		if(!Number.isNaN(ratio) && Number.isFinite(ratio)) {
			size.width = Math.round(ratio * size.height);
		}

		// Resize overlay to match base image dimensions
		resizedOverlayImage = sharp(overlayImageBuffer);
		const resizedOverlay = await resizedOverlayImage
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
		outputBuffer = await output.toBuffer();
	} finally {
		try {
			resizedOverlayImage?.destroy();
		} catch(error) {
			console.error("Error closing resized overlay image:");
			console.error(error);
		}
		try {
			baseImage?.destroy();
		} catch(error) {
			console.error("Error closing base image:");
			console.error(error);
		}
	}
	return outputBuffer;
};
