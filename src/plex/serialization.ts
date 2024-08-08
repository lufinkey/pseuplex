
import xml2js from 'xml2js';
import express from 'express';
import {
	XML_ATTRIBUTES_CHAR
} from '../constants';

const xmlToPlexJsonParser = new xml2js.Parser({
	mergeAttrs: true,
	explicitRoot: true,
	explicitArray: true
});
const xmlToJsonParser = new xml2js.Parser({
	attrkey: XML_ATTRIBUTES_CHAR,
	explicitRoot: true,
	explicitArray: true
});

export const parseHttpContentType = (contentType: string): {contentType: string, contentTypeSuffix: string} => {
	if(!contentType) {
		return { contentType, contentTypeSuffix: '' };
	}
	let contentTypeSuffix = '';
	let delimeterIndex = contentType.indexOf(',');
	if(delimeterIndex == -1) {
		delimeterIndex = contentType.indexOf(';');
	}
	if(delimeterIndex != -1) {
		contentTypeSuffix = contentType.substring(delimeterIndex);
		contentType = contentType.substring(0, delimeterIndex);
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
			if(key == XML_ATTRIBUTES_CHAR) {
				continue;
			}
			const val = json[key];
			modifyXmlJsonToPlexJson(val);
		}
		// merge attributes into object
		const attrs = json[XML_ATTRIBUTES_CHAR];
		if(attrs) {
			delete json[XML_ATTRIBUTES_CHAR];
			Object.assign(json, attrs);
		}
	}
};

export const serializeResponseContent = (userReq: express.Request, userRes: express.Response, data: any): {
	contentType: string;
	data: string;
 } => {
	const acceptType = parseHttpContentType(userReq.headers['accept']).contentType;
	if(acceptType == 'application/json') {
		// convert structure to plex style json
		modifyXmlJsonToPlexJson(data);
		return {
			contentType: 'application/json',
			data: JSON.stringify(data)
		}
	} else {
		// convert back to xml
		const rootKeys = Object.keys(data);
		if(rootKeys.length != 1) {
			console.error("1 key should exist in the root object");
		}
		const rootKey = rootKeys[0];
		const xmlBuilder = new xml2js.Builder({
			rootName: rootKey,
			attrkey: XML_ATTRIBUTES_CHAR
		});
		if(rootKey) {
			data = data[rootKey];
		}
		return {
			contentType: 'text/xml',
			data: xmlBuilder.buildObject(data)
		};
	}
};
