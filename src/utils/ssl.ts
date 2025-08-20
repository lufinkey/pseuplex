
import forge from 'node-forge';
import fs from 'fs';
import path from 'path';
import { isRunningViaBun } from './compat';
import { watchFilepathChanges } from './files';
import { createDebouncer } from './timing';
import type { Logger } from '../logging';

export type SSLConfig = {
	p12Path?: string;
	p12Password?: string;
	certPath?: string;
	keyPath?: string;
};

export type TLSCertificateOptions = {
	ca?: (string | Buffer)[] | Buffer;
	cert?: string | Buffer | (string | Buffer)[];
	key?: string | Buffer;
};

const readP12Data = (p12Data: string | Buffer, password: string | null | undefined) => {
	if(p12Data instanceof Buffer) {
		p12Data = p12Data.toString('binary');
	}
	const p12Asn1 = forge.asn1.fromDer(p12Data as string);
	return password != null
		? forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
		: forge.pkcs12.pkcs12FromAsn1(p12Asn1);
};

const getPrivateKeyFromP12 = (p12: forge.pkcs12.Pkcs12Pfx) => {
	for (const safeContents of p12.safeContents) {
		for (const safeBag of safeContents.safeBags) {
			if (safeBag.type === forge.pki.oids.keyBag || safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag) {
				const key = safeBag.key;
				if(key) {
					return forge.pki.privateKeyToPem(key);
				}
			}
		}
	}
	throw new Error("Private key not found");
};

export const extractP12DataForNode = (p12Data: string | Buffer, password: string | null | undefined): TLSCertificateOptions => {
	const p12 = readP12Data(p12Data, password);

	// get ca certificates
	let ca: string[] | Buffer | undefined;
	const certBags = p12.getBags({bagType: forge.pki.oids.certBag})[forge.pki.oids.certBag];
	if(certBags) {
		// Check if it's a CA certificate (you might need more robust checks depending on your needs)
		for(const bag of certBags) {
			if (bag.cert) {
				const pem = forge.pki.certificateToPem(bag.cert!);
				if(!ca) {
					ca = [];
				}
				(ca as string[]).push(pem);
			}
		}
	}

	// get certificate
	const firstCertBag = certBags?.[0];
	if(!firstCertBag?.cert) {
		throw new Error('No certificates found');
	}
	const cert: Buffer | string = forge.pki.certificateToPem(firstCertBag.cert);

	// get private key
	const privateKey = getPrivateKeyFromP12(p12);

	return {cert, key:privateKey, ca};
};

export const extractP12DataForBun = (p12Data: string | Buffer, password: string | null | undefined): TLSCertificateOptions => {
	const p12 = readP12Data(p12Data, password);
	
	// collect all certs
	const certBags = p12.getBags({bagType: forge.pki.oids.certBag})[forge.pki.oids.certBag];
	if (!certBags?.length || !certBags[0].cert) {
		throw new Error("No certificates found");
	}
	
	// leaf first
	const leaf = certBags[0].cert;
	const leafPem = forge.pki.certificateToPem(leaf);
	
	// intermediates (skip root CAs)
	const isSelfSigned = (c: forge.pki.Certificate) => (c.isIssuer(c) && c.subject.hash === c.issuer.hash);

	const intermediatesPem = certBags
		.slice(1)
		.map(b => b.cert)
		.filter((c): c is forge.pki.Certificate => !!c)
		.filter(c => !isSelfSigned(c))
		.map(c => forge.pki.certificateToPem(c))
		.join("");

	const cert = leafPem + intermediatesPem; // chain in cert (required by Bun)

	// private key
	const privateKey = getPrivateKeyFromP12(p12);

	// IMPORTANT: don't set `ca` for the server chain in Bun
	return { cert, key:privateKey };
};

export const extractP12Data = (p12Data: string | Buffer, password: string | null | undefined): TLSCertificateOptions => {
	if(isRunningViaBun()) {
		return extractP12DataForBun(p12Data, password);
	} else {
		return extractP12DataForNode(p12Data, password);
	}
};

export const readSSLCertAndKey = async (sslConfig: SSLConfig): Promise<TLSCertificateOptions> => {
	if(sslConfig.p12Path) {
		const fileData = await fs.promises.readFile(sslConfig.p12Path);
		return extractP12Data(fileData, sslConfig.p12Password);
	}
	const certPromise = sslConfig.certPath ? fs.promises.readFile(sslConfig.certPath) : undefined;
	const keyPromise = sslConfig.keyPath ? fs.promises.readFile(sslConfig.keyPath) : undefined;
	return {
		cert: await certPromise,
		key: await keyPromise
	};
}

export const watchSSLCertAndKeyChanges = (sslConfig: SSLConfig, opts: {
	debounceDelay?: number,
	logger?: Logger,
}, callback: (certData: TLSCertificateOptions) => void): { close: () => void } | null => {
	const { logger } = opts;
	const debouncer = opts.debounceDelay != null ? createDebouncer(opts.debounceDelay) : undefined;
	const onCallback = async () => {
		let certData: TLSCertificateOptions;
		try {
			certData = await readSSLCertAndKey(sslConfig);
		} catch(error) {
			console.error(`Error while reading SSL certificate and key:`);
			console.error(error);
			return;
		}
		try {
			callback(certData);
		} catch(error) {
			console.error(`Error while handling SSL cert change:`);
			console.error(error);
		}
	};
	if(sslConfig.p12Path) {
		return watchFilepathChanges(sslConfig.p12Path, {
			debouncer,
			logger,
		}, onCallback);
	} else if(sslConfig.certPath && sslConfig.keyPath) {
		let certWatcher: {close: () => void} | undefined;
		let keyWatcher: {close: () => void} | undefined;
		try {
			// TODO have some FSWatcher pool in case cert and key are in the same directory (so we're not watching the directory twice)
			certWatcher = watchFilepathChanges(sslConfig.certPath, {
				debouncer,
				logger,
			}, onCallback);
			keyWatcher = watchFilepathChanges(sslConfig.keyPath, {
				debouncer,
				logger,
			}, onCallback);
		} catch(error) {
			certWatcher?.close();
			keyWatcher?.close();
			throw error;
		}
		return {
			close: () => {
				certWatcher.close();
				keyWatcher.close();
			}
		};
	}
	return null;
};
