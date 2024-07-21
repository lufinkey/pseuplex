
import http from 'http';
import xml2js from 'xml2js';
import express from 'express';

const attrChar = '$';

const xmlToPlexJsonParser = new xml2js.Parser({
	mergeAttrs: true,
	explicitRoot: true,
	explicitArray: true
});
const xmlToJsonParser = new xml2js.Parser({
	attrkey: attrChar,
	explicitRoot: true,
	explicitArray: true
});

export const parseHttpContentType = (contentType: string): {contentType: string, contentTypeSuffix: string} => {
	if(!contentType) {
		return { contentType, contentTypeSuffix: '' };
	}
	let contentTypeSuffix = '';
	const semiColonIndex = contentType.indexOf(';');
	if(semiColonIndex != -1) {
		contentTypeSuffix = contentType.substring(semiColonIndex);
		contentType = contentType.substring(0, semiColonIndex);
	}
	return {contentType,contentTypeSuffix};
};

export const convertXMLStringToPlexJsonString = async (xmlString: string): Promise<string> => {
	const json = await xmlToPlexJsonParser.parseStringPromise(xmlString);
	return JSON.stringify(json);
};

export const parseXMLStringToJson = async (xmlString: string): Promise<any> => {
	return await xmlToJsonParser.parseStringPromise(xmlString);
};

export const modifyXmlJsonToPlexJson = async (json: any): Promise<any> => {
	if(!json || typeof json !== 'object') {
		return;
	}
	// enumerate children
	if(json instanceof Array) {
		// map elements
		for(const element of json) {
			modifyXmlJsonToPlexJson(element);
		}
	} else {
		// map object and children
		for(const key in json) {
			if(key == attrChar) {
				continue;
			}
			const val = json[key];
			modifyXmlJsonToPlexJson(val);
		}
		// merge attributes into object
		const attrs = json[attrChar];
		if(attrs) {
			delete json[attrChar];
			Object.assign(json, attrs);
		}
	}
};

export const serializeResponseContent = (userReq: express.Request, userRes: express.Response, data: any): string => {
	const acceptType = parseHttpContentType(userReq.headers['accept']).contentType;
	if(acceptType == 'application/json') {
		// convert structure to plex style json
		modifyXmlJsonToPlexJson(data);
		return JSON.stringify(data);
	} else {
		// convert back to xml
		const rootKeys = Object.keys(data);
		if(rootKeys.length != 1) {
			console.error("1 key should exist in the root object");
		}
		const rootKey = rootKeys[0];
		const xmlBuilder = new xml2js.Builder({
			rootName: rootKey,
			attrkey: attrChar
		});
		if(rootKey) {
			data = data[rootKey];
		}
		return xmlBuilder.buildObject(data);
	}
};
