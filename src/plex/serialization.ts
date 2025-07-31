
import xml2js from 'xml2js';
import express from 'express';
import * as plexTypes from './types';

export const parseHttpContentType = (contentType: string | null | undefined): {contentTypes: string[], contentTypeSuffix: string} => {
	if(!contentType) {
		return { contentTypes: [], contentTypeSuffix: '' };
	}
	// split content type string
	let delimeterIndex = contentType.indexOf(';');
	let contentTypeSuffix = '';
	if(delimeterIndex != -1) {
		contentTypeSuffix = contentType.substring(delimeterIndex);
		contentType = contentType.substring(0, delimeterIndex);
	}
	return {contentTypes:contentType.split(',').map((part) => part.trim()), contentTypeSuffix};
};

export const parseHttpContentTypeFromHeader = (req: express.Request, header: string) => {
	let contentType = req.headers[header];
	if(contentType instanceof Array) {
		contentType = contentType[0];
	}
	return parseHttpContentType(contentType);
};

const attrKey = '$';

const xmlToJsonParser = new xml2js.Parser({
	explicitRoot: true,
	explicitArray: true,
	attrkey: attrKey as any,
	//mergeAttrs: true
});

export const plexXMLToJS = async (xmlString: string): Promise<any> => {
	const parsedXml = await xmlToJsonParser.parseStringPromise(xmlString);
	return mergeXML2JSAttrs(parsedXml);
};

const mergeXML2JSAttrs = (obj: object) => {
	if(obj instanceof Array) {
		for(const element of obj) {
			mergeXML2JSAttrs(element);
		}
	} else {
		const attrs = obj[attrKey];
		delete obj[attrKey];
		for(const key in obj) {
			const element = obj[key];
			if(element != null && typeof element === 'object') {
				mergeXML2JSAttrs(element);
			}
		}
		Object.assign(obj, attrs);
	}
	return obj;
};

const NameValidationRegex = /^[a-zA-Z0-9:\-_\.]+$/

const convertPlexJSForXMLBuilder = (json: any, parentKey: string) => {
	const xmlObj = {};
	const xmlAttrs = {};
	for(let key in json) {
		// ignore invalid keys
		if(!NameValidationRegex.test(key)) {
			continue;
		}
		const val = json[key];
		if(val == null) {
			// ignore
			continue;
		}
		/*if(key === 'Metadata') {
			let type: string | undefined;
			if(val instanceof Array) {
				for(const el of val) {
					if(type == null) {
						type = el.type;
					}
					else if(el.type != type) {
						type = null;
						break;
					}
				}
			}
			switch(type) {
				case plexTypes.PlexMediaItemType.Movie:
					key = 'Video';
					break;
				case plexTypes.PlexMediaItemType.Track:
					key = 'Track';
					break;
				case plexTypes.PlexMediaItemType.Album:
				case plexTypes.PlexMediaItemType.TVShow:
				case plexTypes.PlexMediaItemType.Season:
					key = 'Directory';
					break;
			}
		}*/
		const valType = typeof val;
		if(valType === 'boolean') {
			xmlAttrs[key] = val ? 1 : 0;
		} else if(valType === 'string' || valType === 'number') {
			xmlAttrs[key] = val;
		} else if(val instanceof Array) {
			xmlObj[key] = val.map((element) => convertPlexJSForXMLBuilder(element, key));
		} else {
			xmlObj[key] = convertPlexJSForXMLBuilder(val, key);
		}
	}
	xmlObj[attrKey] = xmlAttrs;
	return xmlObj;
};

export const plexJSToXML = (json: any): string => {
	// get the root key
	const rootKeys = Object.keys(json);
	if(rootKeys.length != 1) {
		console.error(`1 key should exist in the root object, but found ${rootKeys.length} (${rootKeys.join(", ")})`);
	}
	const rootKey = rootKeys[0];
	// reformat for xml builder
	if(rootKey) {
		json = json[rootKey];
	}
	json = convertPlexJSForXMLBuilder(json, rootKey);
	// convert
	const xmlBuilder = new xml2js.Builder({
		rootName: rootKey,
		attrkey: attrKey,
		xmldec: { 'version': '1.0', 'encoding': 'UTF-8' },
		//renderOpts: {
		//	pretty: true,
		//	indent: '',
		//	newline: '\n',
		//}
	});
	return xmlBuilder.buildObject(json);
};


export const serializeResponseContent = (userReq: express.Request, userRes: express.Response, data: any): {
	contentType: string;
	data: string;
 } => {
	const acceptTypes = parseHttpContentTypeFromHeader(userReq, 'accept').contentTypes;
	if(acceptTypes.indexOf('application/json') != -1) {
		return {
			contentType: 'application/json',
			data: JSON.stringify(data)
		}
	} else {
		const xmlContentType = acceptTypes.find((item) => (item.endsWith('/xml')));
		// convert to xml
		return {
			contentType: xmlContentType || 'application/xml',
			data: plexJSToXML(data)
		};
	}
};
