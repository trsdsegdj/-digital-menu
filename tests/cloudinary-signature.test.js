import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudinarySignature, isCloudinaryPublicIdInFolder } from '../server/cloudinary-signature.js';

test('Cloudinary signature is independent of parameter insertion order',()=>{
	const first = createCloudinarySignature({folder:'business-catalog/items',timestamp:1700000000},'test-secret');
	const second = createCloudinarySignature({timestamp:1700000000,folder:'business-catalog/items'},'test-secret');
	assert.equal(first,second);
	assert.match(first,/^[a-f0-9]{40}$/);
});

test('Cloudinary signature changes when a signed parameter changes',()=>{
	const original = createCloudinarySignature({folder:'business-catalog/items',timestamp:1700000000},'test-secret');
	const modified = createCloudinarySignature({folder:'business-catalog/items',timestamp:1700000001},'test-secret');
	assert.notEqual(original,modified);
	assert.ok(!original.includes('test-secret'));
});

test('Cloudinary delete is restricted to the configured catalog folder',()=>{
	assert.equal(isCloudinaryPublicIdInFolder('business-catalog/items/photo-1','business-catalog/items'),true);
	assert.equal(isCloudinaryPublicIdInFolder('business-catalog/other/photo-1','business-catalog/items'),false);
	assert.equal(isCloudinaryPublicIdInFolder('business-catalog/items/../other/photo-1','business-catalog/items'),false);
	assert.equal(isCloudinaryPublicIdInFolder('business-catalog\\items\\photo-1','business-catalog/items'),false);
});
