
import forge from 'node-forge';
import fs from 'fs';
import path from 'path';
import { watchFilepathChanges } from './files';
import { createDebouncer } from './timing';

export type SSLConfig = {
	p12Path?: string;
	p12Password?: string;
	certPath?: string;
	keyPath?: string;
};

export type CertificateData = {
	ca?: (string | Buffer)[];
	cert?: string | Buffer;
	key?: string | Buffer;
};

export const extractP12Data = (p12Data: string | Buffer, password: string | null | undefined): CertificateData => {
	if(p12Data instanceof Buffer) {
		p12Data = p12Data.toString('binary');
	}
	const p12Asn1 = forge.asn1.fromDer(p12Data as string);
	let p12: forge.pkcs12.Pkcs12Pfx;
	if(password != null) {
		p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
	} else {
		p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1);
	}
	// get ca certificates
	let ca: (string | Buffer)[] | undefined;
	const certBags = p12.getBags({bagType: forge.pki.oids.certBag})[forge.pki.oids.certBag];
	if(certBags) {
		// Check if it's a CA certificate (you might need more robust checks depending on your needs)
		for(const bag of certBags) {
			if (bag.cert) {
				const pem = forge.pki.certificateToPem(bag.cert!);
				if(!ca) {
					ca = [];
				}
				ca.push(pem);
			}
		}
	}
	// get certificate
	const firstCertBag = certBags?.[0];
	if(!firstCertBag?.cert) {
		throw new Error('No certificates found');
	}
	const cert = forge.pki.certificateToPem(firstCertBag.cert);
	// get private key
	let privateKey: string | undefined;
	for (const safeContents of p12.safeContents) {
		for (const safeBag of safeContents.safeBags) {
			if (safeBag.type === forge.pki.oids.keyBag || safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag) {
				const key = safeBag.key;
				privateKey = key != null ? forge.pki.privateKeyToPem(key) : undefined;
				break;
			}
		}
	}
	if (!privateKey) {
		throw new Error("Private key not found");
	}
	return {cert, key:privateKey, ca};
};

export const readSSLCertAndKey = async (sslConfig: SSLConfig): Promise<CertificateData> => {
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

export const watchSSLCertAndKeyChanges = (sslConfig: SSLConfig, opts: {debounceDelay?: number}, callback: (certData: CertificateData) => void): { close: () => void } | null => {
	const debouncer = opts.debounceDelay != null ? createDebouncer(opts.debounceDelay) : undefined;
	const onCallback = async () => {
		let certData: CertificateData;
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
		return watchFilepathChanges(sslConfig.p12Path, {debouncer}, onCallback);
	} else if(sslConfig.certPath && sslConfig.keyPath) {
		let certWatcher: {close: () => void} | undefined;
		let keyWatcher: {close: () => void} | undefined;
		try {
			// TODO have some FSWatcher pool in case cert and key are in the same directory (so we're not watching the directory twice)
			certWatcher = watchFilepathChanges(sslConfig.certPath, {debouncer}, onCallback);
			keyWatcher = watchFilepathChanges(sslConfig.keyPath, {debouncer}, onCallback);
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
