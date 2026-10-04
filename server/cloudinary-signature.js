import { createHash } from 'node:crypto';

export function createCloudinarySignature(params, secret){
	const serializedParams = Object.keys(params)
		.sort()
		.map(key=>`${key}=${params[key]}`)
		.join('&');

	return createHash('sha1')
		.update(`${serializedParams}${secret}`)
		.digest('hex');
}

export function isCloudinaryPublicIdInFolder(publicId,folder){
	if(typeof publicId !== 'string' || typeof folder !== 'string' || !folder.trim()) return false;
	if(publicId.length > 255 || publicId.includes('\\')) return false;
	const segments = publicId.split('/');
	return publicId.startsWith(`${folder}/`)
		&& segments.every(segment=>segment && segment !== '.' && segment !== '..');
}
