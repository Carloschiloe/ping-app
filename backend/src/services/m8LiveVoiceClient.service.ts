import { AppError } from '../utils/AppError';
import { M8_VOICE_PROTOCOL_VERSION } from './m8VoiceBootstrapProtocol';

// Credential-free WebView client served by the HTTPS staging origin. The
// native shell injects the authenticated session envelope; this document
// never contains a provider key, SDP in telemetry, or raw conversation text.
// The bootstrap is a bounded, idempotent protocol: every wait has a timeout,
// configuration can be requested repeatedly, and every terminal error is
// recoverable through an explicit retry instead of an infinite spinner.
const CLIENT_HTML = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;background:#091426;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{text-align:center;padding:28px}.orb{width:112px;height:112px;border-radius:56px;background:#1677e8;box-shadow:0 0 0 14px rgba(22,119,232,.15);margin:0 auto 24px;display:flex;align-items:center;justify-content:center;font-size:44px}.orb.active{animation:pulse 1.5s infinite}.status{font-size:17px;font-weight:600;margin:8px 0}.hint{font-size:13px;color:#a9b7c9;line-height:1.5;max-width:290px;margin:0 auto}.stop,.retry{margin-top:28px;border:0;border-radius:22px;padding:12px 24px;color:white;font-size:16px;font-weight:700}.stop{background:#ef4444}.retry{background:#1677e8;margin-left:8px}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
</style></head><body><main><div id="orb" class="orb">&#9673;</div><div id="status" class="status">Preparando Ping...</div><p id="hint" class="hint">Configurando la conversación segura.</p><button id="stop" class="stop" type="button">Terminar</button><button id="retry" class="retry" type="button" hidden>Reintentar</button><audio id="remote" autoplay playsinline></audio></main><script nonce="__M8_SCRIPT_NONCE__">
(function(){
  const statusEl=document.getElementById('status'),hintEl=document.getElementById('hint'),orb=document.getElementById('orb'),remote=document.getElementById('remote'),retryEl=document.getElementById('retry');
  const CONFIG_PROTOCOL=${M8_VOICE_PROTOCOL_VERSION}, CONFIG_ATTEMPTS=12, CONFIG_INTERVAL=500;
  let cfg=null,pc=null,dc=null,mic=null,startedAt=Date.now(),firstAudioSent=false,assistantSpeaking=false,closed=false,failed=false,currentStage='bootstrap',providerSessionId=null,providerSessionCreated=false,configAttempts=0,reconnectAttempts=0,configTimer=null,sessionTimer=null,disconnectTimer=null,resolveSessionCreated=null,rejectSessionCreated=null;
  const id=()=>{try{return crypto.randomUUID()}catch{return 'm8-'+Date.now()+'-'+Math.random().toString(16).slice(2)}};
  const post=(message)=>{try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(message))}catch{}};
  const setStatus=(text,hint,active=false)=>{statusEl.textContent=text;hintEl.textContent=hint||'';orb.className=active?'orb active':'orb'};
  const telemetry=(event,extra={})=>{if(!cfg)return;const payload={voiceSessionId:cfg.voiceSessionId,deviceSessionId:cfg.deviceSessionId,event,atMs:Math.max(0,Date.now()-startedAt),sessionId:providerSessionId||undefined,...extra};post({type:'telemetry',payload});fetch(cfg.apiUrl+'/agent/voice/live/telemetry',{method:'POST',headers:{Authorization:cfg.authorization,'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{})};
  const stage=(name,text,hint,extra={})=>{currentStage=name;setStatus(text,hint,name==='session_connected'||name==='webrtc_connected'||name==='data_channel_ready'||name==='listening');post({type:'stage',stage:name});telemetry('voice_stage',{stage:name,...extra})};
  const errorDetails=(error)=>{const value=error||{};const name=typeof value.name==='string'?value.name.slice(0,60):'Error';const code=typeof value.code==='string'||typeof value.code==='number'?String(value.code).slice(0,60):undefined;const message=typeof value.message==='string'?value.message.replace(/Bearer\\s+[^\\s]+/ig,'Bearer [redacted]').replace(/https?:\\/\\/[^\\s]+/ig,'[url redacted]').slice(0,120):'voice_session_failed';return {errorName:name,errorCode:code,errorMessage:message}};
  const withTimeout=(promise,ms,code)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(code)),ms);promise.then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})});
  const sendEvent=(value)=>{if(!dc||dc.readyState!=='open')throw new Error('voice_data_channel_unavailable');dc.send(JSON.stringify(value))};
  const validConfig=(value)=>Boolean(value&&typeof value.apiUrl==='string'&&typeof value.authorization==='string'&&value.authorization.length>0&&typeof value.voiceSessionId==='string'&&typeof value.deviceSessionId==='string'&&(!value.protocolVersion||value.protocolVersion===CONFIG_PROTOCOL));
  const acceptConfig=()=>{const next=window.__PING_CONFIG;if(!validConfig(next)||cfg)return false;cfg=next;startedAt=Date.now();post({type:'config_ack',protocolVersion:CONFIG_PROTOCOL,handshakeId:cfg.handshakeId});stage('config_received','Configuración lista','Validando la sesión del usuario.');stage('config_acknowledged','Configuración confirmada','Preparando autenticación de voz.');stage('auth_ready','Autenticación lista','Solicitando acceso al micrófono.');return true};
  const requestConfig=()=>{configAttempts+=1;post({type:'config_requested',protocolVersion:CONFIG_PROTOCOL,handshakeId:window.__PING_CONFIG?.handshakeId,attempt:configAttempts});stage('config_requested','Preparando Ping','Solicitando configuración segura.',{attempt:configAttempts})};
  async function waitForConfig(){
    stage('webview_ready','Preparando Ping','Iniciando el canal seguro.');
    window.addEventListener('ping-config',acceptConfig);
    if(acceptConfig())return;
    for(let attempt=0;attempt<CONFIG_ATTEMPTS&&!cfg;attempt+=1){requestConfig();await new Promise(resolve=>setTimeout(resolve,CONFIG_INTERVAL));acceptConfig()}
    window.removeEventListener('ping-config',acceptConfig);
    if(!cfg)throw new Error('voice_config_timeout');
  }
  const waitForDataChannel=()=>new Promise((resolve,reject)=>{if(dc?.readyState==='open'){stage('data_channel_ready','Canal de control listo','Esperando a Ping.');resolve(true);return}const timer=setTimeout(()=>reject(new Error('data_channel_timeout')),15000);const previous=dc?.onopen;if(dc)dc.onopen=()=>{if(previous)previous.call(dc);clearTimeout(timer);stage('data_channel_ready','Canal de control listo','Esperando a Ping.');resolve(true)}});
  const waitForSessionCreated=()=>new Promise((resolve,reject)=>{if(providerSessionCreated){resolve(true);return}resolveSessionCreated=resolve;rejectSessionCreated=reject;sessionTimer=setTimeout(()=>{rejectSessionCreated=null;resolveSessionCreated=null;reject(new Error('provider_session_timeout'))},20000)});
  const clearPending=()=>{if(configTimer)clearTimeout(configTimer);if(sessionTimer)clearTimeout(sessionTimer);if(disconnectTimer)clearTimeout(disconnectTimer);configTimer=null;sessionTimer=null;disconnectTimer=null;resolveSessionCreated=null;rejectSessionCreated=null};
  function fail(stageName,error,httpStatus){if(failed||closed)return;failed=true;clearPending();const details=errorDetails(error);const failedStage=stageName||currentStage||'unknown';telemetry('error',{detailCode:failedStage,httpStatus,...details,sideEffects:0});post({type:'m8_diagnostic_error',stage:failedStage,details});retryEl.hidden=false;setStatus('No se pudo iniciar la voz','Falló la etapa '+failedStage+'. '+(details.errorCode||details.errorMessage||'Revisa la conexión e inténtalo nuevamente.'),false);}
  async function callCore(input,callId){
    stage('core_request_started','Ping está pensando','Consultando el mismo Ping Core.',{sideEffects:0});
    const body={input,channel:'mobile',locale:cfg.locale,timezone:cfg.timezone,conversationId:cfg.conversationId};
    const response=await withTimeout(fetch(cfg.apiUrl+'/agent/turn',{method:'POST',headers:{Authorization:cfg.authorization,'Content-Type':'application/json','Idempotency-Key':id()},body:JSON.stringify(body)}),20000,'core_request_timeout');
    const text=await response.text();let result=null;try{result=JSON.parse(text)}catch{}
    stage('core_response_received',response.ok?'Respuesta recibida':'Core no disponible','Preparando la respuesta de voz.',{httpStatus:response.status,sideEffects:0});
    if(!response.ok)throw new Error('core_'+response.status);
    const core=result||{kind:'error',status:'unavailable'};const kind=core.kind==='plan'?'plan':core.kind==='clarification'?'clarification':core.kind==='response'?'response':'error';
    telemetry('core_disposition',{coreKind:kind,confirmationRequired:core.confirmationRequested===true,sideEffects:0});
    if(core.confirmationRequested===true)telemetry('confirmation_requested',{coreKind:'plan',confirmationRequired:true,sideEffects:0});
    sendEvent({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify({core})}});sendEvent({type:'response.create'});
  }
  function onEvent(raw){
    let event;try{event=JSON.parse(raw.data||raw)}catch{telemetry('error',{detailCode:'provider_event_invalid_json',sideEffects:0});return}
    if(event.type==='session.created'){providerSessionCreated=true;providerSessionId=event.session?.id||providerSessionId;if(sessionTimer)clearTimeout(sessionTimer);if(resolveSessionCreated)resolveSessionCreated(true);resolveSessionCreated=null;rejectSessionCreated=null;telemetry('session_connected',{sessionId:providerSessionId});stage('session_connected','Ping está escuchando','Habla cuando quieras.');stage('listening','Ping está listo','Habla cuando quieras.');return}
    if(event.type==='input_audio_buffer.speech_started'){if(assistantSpeaking){try{sendEvent({type:'response.cancel'})}catch{}telemetry('barge_in',{sideEffects:0});stage('barge_in_detected','Ping te escucha','Interrumpiendo la respuesta anterior.',{sideEffects:0});assistantSpeaking=false}telemetry('speech_started',{sideEffects:0});return}
    if(event.type==='input_audio_buffer.speech_stopped'){telemetry('speech_stopped',{sideEffects:0});return}
    if(event.type==='response.output_audio_transcript.delta'||event.type==='response.output_audio.delta'){if(!assistantSpeaking){assistantSpeaking=true;telemetry('assistant_audio_started',{sideEffects:0});stage('audio_output_started','Ping está respondiendo','Puedes interrumpirlo cuando quieras.',{sideEffects:0})}return}
    if(event.type==='response.output_audio.done'){assistantSpeaking=false;telemetry('assistant_audio_stopped',{sideEffects:0});return}
    if(event.type==='response.function_call_arguments.done'){let args;try{args=JSON.parse(event.arguments||'{}')}catch{telemetry('error',{detailCode:'invalid_tool_arguments',sideEffects:0});return}if(typeof args.input!=='string'||!args.input.trim()){telemetry('error',{detailCode:'missing_core_input',sideEffects:0});return}callCore(args.input,event.call_id).catch(error=>fail('core_request',error));return}
    if(event.type==='session.closed'){closed=true;clearPending();telemetry('session_closed',{sideEffects:0});setStatus('Conversación terminada','');return}
    if(event.type==='error'){fail('provider_event',new Error('provider_event_error'));}
  }
  async function start(){
    try{
      await waitForConfig();
      if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection!=='function')throw new Error('webrtc_unavailable');
      stage('permission_request','Solicitando micrófono','Acepta el permiso para hablar con Ping.');
      mic=await withTimeout(navigator.mediaDevices.getUserMedia({audio:true}),15000,'microphone_permission_timeout');
      stage('permission_granted','Micrófono listo','Preparando conexión de voz.');
      pc=new RTCPeerConnection();
      pc.ontrack=(event)=>{stage('audio_ready','Audio de Ping listo','La conversación puede continuar.');remote.srcObject=event.streams[0];remote.play().catch(()=>{})};
       pc.onconnectionstatechange=()=>{const state=pc.connectionState;if(state==='connected'){if(disconnectTimer)clearTimeout(disconnectTimer);disconnectTimer=null;stage('webrtc_connected','Canal de voz conectado','Ping está listo.');}else if(state==='failed'||state==='closed')fail('webrtc_'+state,new Error('webrtc_'+state));else if(state==='disconnected'){stage('webrtc_disconnected','Conexión interrumpida','Intentando recuperar la conversación.');telemetry('error',{detailCode:'webrtc_disconnected',sideEffects:0});if(!disconnectTimer)disconnectTimer=setTimeout(()=>{if(reconnectAttempts<1&&!closed){reconnectAttempts+=1;telemetry('reconnect_attempt',{sideEffects:0});post({type:'retry'})}else fail('webrtc_disconnected',new Error('webrtc_reconnect_exhausted'))},5000)}};
      pc.oniceconnectionstatechange=()=>{if(pc.iceConnectionState==='failed')fail('ice_failed',new Error('ice_failed'))};
      remote.onplaying=()=>{if(!firstAudioSent){firstAudioSent=true;telemetry('first_useful_audio',{sideEffects:0})}};
      mic.getTracks().forEach(track=>pc.addTrack(track,mic));stage('peer_created','Preparando conexión de voz','Creando oferta segura.');
      dc=pc.createDataChannel('oai-events');dc.onmessage=onEvent;dc.onerror=()=>fail('data_channel_error',new Error('data_channel_error'));
      const offer=await withTimeout(pc.createOffer(),10000,'offer_timeout');stage('offer_created','Oferta creada','Negociando la sesión.');await withTimeout(pc.setLocalDescription(offer),10000,'local_description_timeout');stage('rtc_negotiating','Negociando sesión','Contactando al backend de staging.');
      stage('voice_session_requested','Autenticando voz','Abriendo sesión segura en staging.');
      const response=await withTimeout(fetch(cfg.apiUrl+'/agent/voice/live/session',{method:'POST',headers:{Authorization:cfg.authorization,'Content-Type':'application/json'},body:JSON.stringify({sdp:offer.sdp,voiceSessionId:cfg.voiceSessionId,deviceSessionId:cfg.deviceSessionId,conversationId:cfg.conversationId,locale:cfg.locale,timezone:cfg.timezone})}),20000,'session_request_timeout');
      stage('voice_session_received',response.ok?'Sesión aceptada':'Sesión rechazada','Finalizando conexión.',{httpStatus:response.status});
      const body=await response.text();let result=null;try{result=JSON.parse(body)}catch{}
      if(!response.ok)throw Object.assign(new Error(result?.error||'live_session_failed'),{httpStatus:response.status});
      if(!result?.sdp||!result?.sessionId)throw new Error('live_session_incomplete');
       providerSessionId=result.sessionId;await withTimeout(pc.setRemoteDescription({type:'answer',sdp:result.sdp}),15000,'remote_description_timeout');stage('remote_description_set','Sesión de voz lista','Esperando confirmación del canal.');
      await waitForDataChannel();await waitForSessionCreated();
    }catch(error){fail(currentStage,error,error?.httpStatus)}
  }
  function stop(){if(closed)return;try{if(dc&&dc.readyState==='open')dc.send(JSON.stringify({type:'session.close'}))}catch{}if(mic)mic.getTracks().forEach(t=>t.stop());if(pc)pc.close();closed=true;clearPending();if(cfg)telemetry('session_closed',{sideEffects:0});post({type:'closed'})}
  document.getElementById('stop').addEventListener('click',stop);retryEl.addEventListener('click',()=>{post({type:'retry'});if(!window.ReactNativeWebView)location.reload()});window.addEventListener('beforeunload',stop);post({type:'webview_ready',protocolVersion:CONFIG_PROTOCOL});void start();
})();
</script></body></html>`;

export function getM8LiveVoiceClientHtml(scriptNonce = 'm8-test-nonce'): string {
    if (process.env.PING_ENVIRONMENT !== 'staging') {
        throw new AppError('Live voice is not enabled in this environment', 404);
    }
    return CLIENT_HTML.replace('__M8_SCRIPT_NONCE__', scriptNonce);
}
