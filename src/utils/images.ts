import sharp from 'sharp';

export type ApplyOverlayToImageOptions = {
	resize?: {width: number, height: number};
	keepAspectRatio?: boolean
};

export const applyOverlayToImage = async (imageBuffer: Buffer | ArrayBuffer, overlayImageBuffer: Buffer, options?: ApplyOverlayToImageOptions): Promise<Buffer> => {
	let image: sharp.Sharp | undefined;
	let overlayImage: sharp.Sharp | undefined;
	let outputBuffer: Buffer;
	try {
		// load image and get dimensions
		image = sharp(imageBuffer);
		const baseMeta = await image.metadata();
		let size;
		if(options?.resize) {
			size = options.resize;
		} else {
			size = {width:baseMeta.width, height:baseMeta.height};
		}
		if(options?.keepAspectRatio) {
			const ratio = baseMeta.width / baseMeta.height;
			if(!Number.isNaN(ratio) && Number.isFinite(ratio)) {
				size.width = Math.round(ratio * size.height);
			}
		}

		// Resize overlay to match base image dimensions
		overlayImage = sharp(overlayImageBuffer);
		const resizedOverlay = await overlayImage
			.resize(size.width, size.height, {
				fit: 'fill',
			})
			.toBuffer();
		
		// Resize the base image if needed
		if(options?.resize) {
			image = image.resize(size.width, size.height);
		}

		// Composite the resized overlay onto the base image
		image = image.composite([{
			input: resizedOverlay,
			top: 0,
			left: 0
		}]);
		outputBuffer = await image.toBuffer();
	} finally {
		try {
			overlayImage?.destroy();
		} catch(error) {
			console.error("Error closing resized overlay image:");
			console.error(error);
		}
		try {
			image?.destroy();
		} catch(error) {
			console.error("Error closing base image:");
			console.error(error);
		}
	}
	return outputBuffer;
};


export const getResizedImageFromFile = async (filepath: string, options: {
	width?: number,
	height?: number,
	keepAspectRatio?: boolean,
	resizeOptions?: sharp.ResizeOptions,
}): Promise<{image: sharp.Sharp, meta: sharp.Metadata}> => {
	// load image and get dimensions
	const image = sharp(filepath);
	const meta = await image.metadata();
	let size: {width: number, height: number} | undefined;
	if(options.width) {
		if(options.height) {
			size = {
				width: options.width,
				height: options.height,
			};
			if(options.keepAspectRatio) {
				const ratio = meta.width / meta.height;
				if(!Number.isNaN(ratio) && Number.isFinite(ratio)) {
					size.width = Math.round(ratio * size.height);
				}
			}
		} else {
			const ratio = meta.height / meta.width;
			if(!Number.isNaN(ratio) && Number.isFinite(ratio)) {
				size = {
					width: options.width,
					height: Math.round(ratio * options.width),
				};
			}
		}
	} else if(options.height) {
		const ratio = meta.width / meta.height;
		if(!Number.isNaN(ratio) && Number.isFinite(ratio)) {
			size = {
				width: Math.round(ratio * options.height),
				height: options.height,
			};
		}
	}
	if(!size) {
		return {image, meta};
	}
	return {
		image: image.resize(size.width, size.height),
		meta,
	};
};
