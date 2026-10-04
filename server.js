import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createCloudinarySignature, isCloudinaryPublicIdInFolder } from './server/cloudinary-signature.js';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT) || 8000;

function getFirebaseWebConfig(){
	const config = {
		apiKey: process.env.FIREBASE_API_KEY,
		authDomain: process.env.FIREBASE_AUTH_DOMAIN,
		projectId: process.env.FIREBASE_PROJECT_ID,
		storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
		messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
		appId: process.env.FIREBASE_APP_ID,
		measurementId: process.env.FIREBASE_MEASUREMENT_ID
	};
	const missing = Object.entries(config).filter(([,value])=>!value).map(([key])=>key);
	if(missing.length) throw new Error(`Missing Firebase configuration: ${missing.join(', ')}`);
	return config;
}

function getAdminUidAllowlist(){
	return new Set((process.env.FIREBASE_ADMIN_UIDS || '').split(',').map(uid=>uid.trim()).filter(Boolean));
}

function getPrimaryAdminUid(){
	return process.env.FIREBASE_PRIMARY_ADMIN_UID || '';
}

function getAdminAuth(){
	const projectId = process.env.FIREBASE_PROJECT_ID;
	if(!projectId) throw new Error('FIREBASE_PROJECT_ID is not configured.');
	let credential = applicationDefault();
	if(process.env.FIREBASE_SERVICE_ACCOUNT_JSON){
		let serviceAccount;
		try{
			serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
		}catch(error){
			throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.',{cause:error});
		}
		if(serviceAccount.project_id !== projectId){
			throw new Error('Firebase Admin service account project_id does not match FIREBASE_PROJECT_ID.');
		}
		credential = cert(serviceAccount);
	}
	const adminApp = getApps().find(existingApp=>existingApp.options.projectId === projectId)
		|| initializeApp({credential,projectId});
	return getAuth(adminApp);
}

function isAdminUser(user){
	return getAdminUidAllowlist().has(user.uid) || user.admin === true || user.primaryAdmin === true;
}

function authErrorStatus(error){
	return ['auth/argument-error','auth/id-token-expired','auth/invalid-id-token','auth/revoked-id-token','auth/user-disabled','auth/user-not-found'].includes(error?.code)
		? 401
		: 503;
}

async function authorizeAdminRequest(request,{primaryOnly=false}={}){
	const primaryUid = getPrimaryAdminUid();
	if(primaryOnly && !primaryUid){
		return {status:503,error:'Set FIREBASE_PRIMARY_ADMIN_UID on the server to enable admin account management.'};
	}
	const authorization = request.get('authorization') || '';
	const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
	if(!idToken) return {status:401,error:'Sign in to continue.'};

	try{
		const user = await getAdminAuth().verifyIdToken(idToken,true);
		if(!isAdminUser(user)) return {status:403,error:'This account is not authorized for admin access.'};
		if(primaryOnly && user.uid !== primaryUid) return {status:403,error:'Only the primary admin can manage admin accounts.'};
		return {user};
	}catch(error){
		console.error('Could not verify Firebase admin token:',error);
		return authErrorStatus(error) === 401
			? {status:401,error:'Your sign-in session is invalid or expired. Sign in again.'}
			: {status:503,error:'Firebase Admin could not verify the sign-in token. Configure valid Firebase Admin credentials on the server.'};
	}
}

function sendAdminOperationError(response,error,action){
	console.error(`${action} failed:`,error);
	if(error?.code === 'auth/email-already-exists'){
		response.status(409).json({error:'An account with this email already exists.'});
		return;
	}
	if(error?.code === 'auth/user-not-found'){
		response.status(404).json({error:'Admin account not found.'});
		return;
	}
	if(error?.code === 'auth/invalid-password' || error?.code === 'auth/invalid-email'){
		response.status(400).json({error:'Check the email and password and try again.'});
		return;
	}
	response.status(500).json({error:`Could not ${action.toLowerCase()}. Check Firebase Admin credentials and server logs.`});
}

app.disable('x-powered-by');
app.use(compression({level:6,threshold:1024}));
app.use(express.json({limit:'16kb'}));

app.get('/healthz',(_request,response)=>{
	response.set('Cache-Control','no-store');
	response.status(200).json({status:'ok'});
});

app.get('/api/config', (_request,response)=>{
	try{
		response.set('Cache-Control','no-store');
		response.json({firebase:getFirebaseWebConfig()});
	}catch(error){
		console.error('Public Firebase configuration is incomplete:',error.message);
		response.status(503).json({error:'Firebase configuration is incomplete on the server.'});
	}
});

app.get('/shared/firebase-config.js', (_request,response)=>{
	try{
		response.set({
			'Cache-Control':'public, max-age=300, stale-while-revalidate=3600',
			'Content-Type':'text/javascript; charset=utf-8'
		});
		response.send(`export const firebaseConfig = ${JSON.stringify(getFirebaseWebConfig())};`);
	}catch(error){
		console.error('Public Firebase configuration is incomplete:',error.message);
		response.status(503).type('text').send('throw new Error("Firebase configuration is incomplete on the server.");');
	}
});

app.get('/api/admin/access',async (request,response)=>{
	const authorization = await authorizeAdminRequest(request);
	if(authorization.error){
		response.status(authorization.status).json({error:authorization.error});
		return;
	}
	try{
		const user = authorization.user;
		const isPrimary = user.uid === getPrimaryAdminUid();
		const shouldPromote = getAdminUidAllowlist().has(user.uid) && !user.admin;
		if(shouldPromote || (isPrimary && !user.primaryAdmin)){
			const auth = getAdminAuth();
			const record = await auth.getUser(user.uid);
			await auth.setCustomUserClaims(user.uid,{
				...record.customClaims,
				admin:true,
				...(isPrimary ? {primaryAdmin:true} : {})
			});
			response.set('Cache-Control','no-store');
			response.json({authorized:true,refreshToken:true});
			return;
		}
		response.set('Cache-Control','no-store');
		response.json({authorized:true,primary:isPrimary});
	}catch(error){
		console.error('Could not prepare Firebase admin claims:',error);
		response.status(503).json({error:'Could not prepare admin access. Check Firebase Admin credentials.'});
	}
});

app.get('/api/admin/accounts',async (request,response)=>{
	const authorization = await authorizeAdminRequest(request,{primaryOnly:true});
	if(authorization.error){
		response.status(authorization.status).json({error:authorization.error});
		return;
	}
	try{
		const auth = getAdminAuth();
		const allowlistedUids = getAdminUidAllowlist();
		const primaryUid = getPrimaryAdminUid();
		const users = [];
		let pageToken;
		do{
			const page = await auth.listUsers(1000,pageToken);
			users.push(...page.users);
			pageToken = page.pageToken;
		}while(pageToken);

		const admins = users
			.filter(user=>user.uid === primaryUid || allowlistedUids.has(user.uid) || user.customClaims?.admin === true)
			.map(user=>({
				uid:user.uid,
				email:user.email || '',
				primary:user.uid === primaryUid,
				disabled:user.disabled
			}))
			.sort((left,right)=>Number(right.primary)-Number(left.primary) || left.email.localeCompare(right.email));
		response.set('Cache-Control','no-store');
		response.json({admins});
	}catch(error){
		sendAdminOperationError(response,error,'Load admin accounts');
	}
});

app.post('/api/admin/accounts',async (request,response)=>{
	const authorization = await authorizeAdminRequest(request,{primaryOnly:true});
	if(authorization.error){
		response.status(authorization.status).json({error:authorization.error});
		return;
	}
	const email = typeof request.body?.email === 'string' ? request.body.email.trim() : '';
	const password = typeof request.body?.password === 'string' ? request.body.password : '';
	if(!email || !password){
		response.status(400).json({error:'Enter an email and password.'});
		return;
	}
	if(password.length < 8 || password.length > 128){
		response.status(400).json({error:'Password must be between 8 and 128 characters.'});
		return;
	}
	try{
		const auth = getAdminAuth();
		const user = await auth.createUser({email,password});
		try{
			await auth.setCustomUserClaims(user.uid,{...user.customClaims,admin:true});
		}catch(error){
			await auth.deleteUser(user.uid);
			throw error;
		}
		response.status(201).json({message:'Admin added.'});
	}catch(error){
		sendAdminOperationError(response,error,'Create admin account');
	}
});

app.patch('/api/admin/accounts/:uid/password',async (request,response)=>{
	const authorization = await authorizeAdminRequest(request,{primaryOnly:true});
	if(authorization.error){
		response.status(authorization.status).json({error:authorization.error});
		return;
	}
	const password = typeof request.body?.password === 'string' ? request.body.password : '';
	if(password.length < 8 || password.length > 128){
		response.status(400).json({error:'Password must be between 8 and 128 characters.'});
		return;
	}
	try{
		const auth = getAdminAuth();
		const user = await auth.getUser(request.params.uid);
		if(user.uid !== getPrimaryAdminUid() && !getAdminUidAllowlist().has(user.uid) && user.customClaims?.admin !== true){
			response.status(404).json({error:'Admin account not found.'});
			return;
		}
		await auth.updateUser(user.uid,{password});
		await auth.revokeRefreshTokens(user.uid);
		response.json({message:'Password changed. Sign in again with the new password.'});
	}catch(error){
		sendAdminOperationError(response,error,'Change admin password');
	}
});

app.delete('/api/admin/accounts/:uid',async (request,response)=>{
	const authorization = await authorizeAdminRequest(request,{primaryOnly:true});
	if(authorization.error){
		response.status(authorization.status).json({error:authorization.error});
		return;
	}
	const uid = request.params.uid;
	if(uid === getPrimaryAdminUid()){
		response.status(400).json({error:'The primary admin account cannot be removed.'});
		return;
	}
	try{
		const auth = getAdminAuth();
		const user = await auth.getUser(uid);
		if(!getAdminUidAllowlist().has(user.uid) && user.customClaims?.admin !== true){
			response.status(404).json({error:'Admin account not found.'});
			return;
		}
		await auth.deleteUser(uid);
		response.json({message:'Admin removed.'});
	}catch(error){
		sendAdminOperationError(response,error,'Remove admin account');
	}
});

app.post('/api/cloudinary/sign', async (request,response)=>{
	const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
	const apiKey = process.env.CLOUDINARY_API_KEY;
	const apiSecret = process.env.CLOUDINARY_API_SECRET;
	const folder = process.env.CLOUDINARY_FOLDER || 'business-catalog/items';

	if(!cloudName || !apiKey || !apiSecret){
		response.status(503).json({error:'Cloudinary server configuration is incomplete.'});
		return;
	}
	if(!getAdminUidAllowlist().size && !getPrimaryAdminUid()){
		response.status(503).json({error:'No Firebase admin UIDs are configured on the server.'});
		return;
	}

	const authorization = await authorizeAdminRequest(request);
	if(authorization.error){
		response.status(authorization.status).json({error:authorization.error});
		return;
	}

	try{
		const timestamp = Math.floor(Date.now()/1000);
		const params = {folder,timestamp};
		response.set('Cache-Control','no-store');
		response.json({
			cloudName,
			apiKey,
			folder,
			timestamp,
			signature:createCloudinarySignature(params,apiSecret)
		});
	}catch(error){
		console.error('Could not sign Cloudinary upload:',error);
		response.status(500).json({error:'Could not prepare the Cloudinary upload. Check server configuration.'});
	}
});

app.post('/api/cloudinary/delete',async (request,response)=>{
	const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
	const apiKey = process.env.CLOUDINARY_API_KEY;
	const apiSecret = process.env.CLOUDINARY_API_SECRET;
	const folder = process.env.CLOUDINARY_FOLDER || 'business-catalog/items';
	if(!cloudName || !apiKey || !apiSecret){
		response.status(503).json({error:'Cloudinary server configuration is incomplete.'});
		return;
	}

	const authorization = await authorizeAdminRequest(request);
	if(authorization.error){
		response.status(authorization.status).json({error:authorization.error});
		return;
	}

	const publicId = typeof request.body?.public_id === 'string' ? request.body.public_id.trim() : '';
	if(!isCloudinaryPublicIdInFolder(publicId,folder)){
		response.status(400).json({error:'The image does not belong to the configured catalog upload folder.'});
		return;
	}

	try{
		const timestamp = Math.floor(Date.now()/1000);
		const params = {public_id:publicId,timestamp};
		const formData = new URLSearchParams({
			public_id:publicId,
			timestamp:String(timestamp),
			api_key:apiKey,
			signature:createCloudinarySignature(params,apiSecret)
		});
		const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,{
			method:'POST',
			headers:{'Content-Type':'application/x-www-form-urlencoded'},
			body:formData
		});
		const result = await cloudinaryResponse.json();
		if(!cloudinaryResponse.ok || !['ok','not found'].includes(result.result)){
			console.error('Cloudinary rejected image deletion:',result.error?.message || result.result || cloudinaryResponse.status);
			response.status(502).json({error:'Cloudinary could not delete the image. The catalog update is saved; this image may require manual cleanup.'});
			return;
		}
		response.set('Cache-Control','no-store');
		response.json({deleted:true});
	}catch(error){
		console.error('Could not delete Cloudinary image:',error);
		response.status(502).json({error:'Could not reach Cloudinary to delete the image. The catalog update is saved; this image may require manual cleanup.'});
	}
});

app.use((request,response,next)=>{
	const configuredCredentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
	const requestedPath = path.resolve(projectRoot,`.${request.path}`);
	const credentialPath = configuredCredentialPath
		? path.resolve(projectRoot,configuredCredentialPath)
		: '';
	if(/^\/(?:server\.js|package(?:-lock)?\.json|\.env(?:\..*)?)$/i.test(request.path)
		|| /^\/(?:node_modules|server|tests)(?:\/|$)/i.test(request.path)
		|| /(?:^|\/)[^/]*(?:firebase-adminsdk|service-account)[^/]*\.json$/i.test(request.path)
		|| (credentialPath && requestedPath === credentialPath)){
		response.sendStatus(404);
		return;
	}
	next();
});

app.use(express.static(projectRoot,{
	dotfiles:'deny',
	index:'index.html',
	setHeaders(response,filePath){
		if(filePath.endsWith(`${path.sep}service-worker.js`) || /\.html?$/i.test(filePath)){
			response.setHeader('Cache-Control','no-cache');
			return;
		}
		const requestUrl = response.req?.originalUrl || '';
		if(/[?&]v=[^&]+/.test(requestUrl)){
			response.setHeader('Cache-Control','public, max-age=31536000, immutable');
			return;
		}
		response.setHeader('Cache-Control','public, max-age=3600, stale-while-revalidate=86400');
	}
}));

const server = app.listen(port,'0.0.0.0',()=>{
	console.log(`Restaurant menu server listening on http://0.0.0.0:${port}`);
});

server.requestTimeout = 30000;
server.headersTimeout = 35000;
server.keepAliveTimeout = 5000;
