import { AppError } from '../utils/AppError';

// Credential-free WebView client served by the HTTPS staging origin. The
// native shell injects the authenticated session envelope; this document
// never contains a provider key, SDP in telemetry, or raw conversation text.
// Every setup boundary reports a bounded, sanitized stage so a stalled mobile
// session is diagnosable instead of remaining indefinitely on "Conectando".
const CLIENT_HTML = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;background:#091426;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{text-align:center;padding:28px}.orb{width:112px;height:112px;border-radius:56px;background:#1677e8;box-shadow:0 0 0 14px rgba(22,119,232,.15);margin:0 auto 24px;display:flex;align-items:center;justify-content:center;font-size:44px}.orb.active{animation:pulse 1.5s infinite}.status{font-size:17px;font-weight:600;margin:8px 0}.hint{font-size:13px;color:#a9b7c9;line-height:1.5;max-width:290px;margin:0 auto}.stop{margin-top:28px;background:#ef4444;border:0;border-radius:22px;padding:12px 24px;color:white;font-size:16px;font-weight:700}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
</style></head><body><main><div id="orb" class="orb">&#9673;</div><div id="status" class="status">Preparando Ping...</div><p id="hint" class="hint">Configurando la conversación segura.</p><button id="stop" class="stop" type="button">Terminar</button><audio id="remote" autoplay playsinline></audio></main><script>
(function(){
  const statusEl=document.getElementById('status'),hintEl=document.getElementById('hint'),orb=document.getElementById('orb'),remote=document.getElementById('remote');
  let cfg=null,pc=null,dc=null,mic=null,startedAt=0,firstAudioSent=false,assistantSpeaking=false,closed=false,providerSessionId=null;
  const id=()=>{try{return crypto.randomUUID()}catch{return 'm8-'+Date.now()+'-'+Math.random().toString(16).slice(2)}};
  const post=(message)=>{try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(message))}catch{}};
  const setStatus=(text,hint,active=false)=>{statusEl.textContent=text;hintEl.textContent=hint||'';orb.className=active?'orb active':'orb'};
  const telemetry=(event,extra={})=>{if(!cfg)return;const payload={voiceSessionId:cfg.voiceSessionId,deviceSessionId:cfg.deviceSessionId,event,atMs:Math.max(0,Date.now()-startedAt),sessionId:providerSessionId||undefined,...extra};post({type:'telemetry',payload});fetch(cfg.apiUrl+'/agent/voice/live/telemetry',{method:'POST',headers:{Authorization:cfg.authorization,'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{})};
  const stage=(name,text,hint,extra={})=>{setStatus(text,hint,name==='session_connected'||name==='webrtc_connected'||name==='data_channel_open');post({type:'stage',stage:name});telemetry('voice_stage',{stage:name,...extra})};
  const errorDetails=(error)=>{const value=error||{};const name=typeof value.name==='string'?value.name.slice(0,60):'Error';const code=typeof value.code==='string'||typeof value.code==='number'?String(value.code).slice(0,60):undefined;const message=typeof value.message==='string'?value.message.replace(/Bearer\\s+[^\\s]+/ig,'Bearer [redacted]').slice(0,120):'voice_session_failed';return {errorName:name,errorCode:code,errorMessage:message}};
  const withTimeout=(promise,ms,code)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(code)),ms);promise.then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})});
  const sendEvent=(value)=>{if(!dc||dc.readyState!=='open')throw new Error('voice_data_channel_unavailable');dc.send(JSON.stringify(value))};
  async function waitForConfig(){
    stage('client_boot','Preparando Ping','Esperando la configuración segura del dispositivo.');
    for(let attempt=0;attempt<100;attempt+=1){if(window.__PING_CONFIG){cfg=window.__PING_CONFIG;startedAt=Date.now();stage('config_received','Configuración lista','Solicitando acceso al micrófono.');return}await new Promise(resolve=>setTimeout(resolve,100))}
    throw new Error('voice_config_timeout');
  }
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
    let event;try{event=JSON.parse(raw.data||raw)}catch{return}
    if(event.type==='session.created'){providerSessionId=event.session?.id||providerSessionId;telemetry('session_connected',{sessionId:providerSessionId});stage('session_connected','Ping está escuchando','Habla cuando quieras.');return}
    if(event.type==='input_audio_buffer.speech_started'){if(assistantSpeaking){try{sendEvent({type:'response.cancel'})}catch{}telemetry('barge_in',{sideEffects:0});stage('barge_in_detected','Ping te escucha','Interrumpiendo la respuesta anterior.',{sideEffects:0});assistantSpeaking=false}telemetry('speech_started',{sideEffects:0});return}
    if(event.type==='input_audio_buffer.speech_stopped'){telemetry('speech_stopped',{sideEffects:0});return}
    if(event.type==='response.output_audio_transcript.delta'){if(!assistantSpeaking){assistantSpeaking=true;telemetry('assistant_audio_started',{sideEffects:0});stage('audio_output_started','Ping está respondiendo','Puedes interrumpirlo cuando quieras.',{sideEffects:0})}return}
    if(event.type==='response.output_audio.done'){assistantSpeaking=false;telemetry('assistant_audio_stopped',{sideEffects:0});return}
    if(event.type==='response.function_call_arguments.done'){let args;try{args=JSON.parse(event.arguments||'{}')}catch{telemetry('error',{detailCode:'invalid_tool_arguments',sideEffects:0});return}if(typeof args.input!=='string'||!args.input.trim()){telemetry('error',{detailCode:'missing_core_input',sideEffects:0});return}callCore(args.input,event.call_id).catch(error=>reportError('core_request',error));return}
    if(event.type==='session.closed'){closed=true;telemetry('session_closed',{sideEffects:0});setStatus('Conversación terminada','');return}
    if(event.type==='error'){telemetry('error',{detailCode:'provider_event',sideEffects:0});stage('provider_event','Ping no pudo continuar','El proveedor devolvió un error de sesión.');}
  }
  function reportError(stageName,error,httpStatus){const details=errorDetails(error);telemetry('error',{detailCode:stageName,httpStatus,...details,sideEffects:0});post({type:'error',stage:stageName,details});setStatus('No se pudo iniciar la voz','Etapa: '+stageName+'. El modo de texto sigue disponible.');}
  async function start(){
    try{
      await waitForConfig();
      if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection!=='function')throw new Error('webrtc_unavailable');
      stage('permission_request','Solicitando micrófono','Acepta el permiso para hablar con Ping.');
      mic=await withTimeout(navigator.mediaDevices.getUserMedia({audio:true}),15000,'microphone_permission_timeout');
      stage('permission_granted','Micrófono listo','Preparando conexión de voz.');
      pc=new RTCPeerConnection();
      pc.ontrack=(event)=>{stage('audio_track_received','Conexión de audio lista','Esperando a Ping.');remote.srcObject=event.streams[0];remote.play().catch(()=>{})};
      pc.onconnectionstatechange=()=>{const state=pc.connectionState;if(state==='connected')stage('webrtc_connected','Canal de voz conectado','Ping está preparando la conversación.');else if(state==='failed'||state==='disconnected')telemetry('error',{detailCode:'webrtc_'+state,sideEffects:0})};
      pc.oniceconnectionstatechange=()=>{if(pc.iceConnectionState==='failed')telemetry('error',{detailCode:'ice_failed',sideEffects:0})};
      remote.onplaying=()=>{if(!firstAudioSent){firstAudioSent=true;telemetry('first_useful_audio',{sideEffects:0})}};
      mic.getTracks().forEach(track=>pc.addTrack(track,mic));stage('peer_created','Preparando conexión de voz','Creando oferta segura.');
      dc=pc.createDataChannel('oai-events');dc.onopen=()=>stage('data_channel_open','Canal de control listo','Esperando a Ping.');dc.onmessage=onEvent;dc.onerror=()=>telemetry('error',{detailCode:'data_channel_error',sideEffects:0});
      const offer=await withTimeout(pc.createOffer(),10000,'offer_timeout');stage('offer_created','Oferta creada','Negociando la sesión.');await withTimeout(pc.setLocalDescription(offer),10000,'local_description_timeout');stage('local_description_set','Negociando sesión','Contactando al backend de staging.');
      stage('session_request_started','Autenticando voz','Abriendo sesión segura en staging.');
      const response=await withTimeout(fetch(cfg.apiUrl+'/agent/voice/live/session',{method:'POST',headers:{Authorization:cfg.authorization,'Content-Type':'application/json'},body:JSON.stringify({sdp:offer.sdp,voiceSessionId:cfg.voiceSessionId,deviceSessionId:cfg.deviceSessionId,conversationId:cfg.conversationId,locale:cfg.locale,timezone:cfg.timezone})}),20000,'session_request_timeout');
      stage('session_response_received',response.ok?'Sesión aceptada':'Sesión rechazada','Finalizando conexión.',{httpStatus:response.status});
      const body=await response.text();let result=null;try{result=JSON.parse(body)}catch{}
      if(!response.ok)throw Object.assign(new Error(result?.error||'live_session_failed'),{httpStatus:response.status});
      if(!result?.sdp||!result?.sessionId)throw new Error('live_session_incomplete');
      providerSessionId=result.sessionId;await withTimeout(pc.setRemoteDescription({type:'answer',sdp:result.sdp}),15000,'remote_description_timeout');stage('remote_description_set','Sesión de voz lista','Esperando a Ping.');stage('waiting_session_created','Conectando con Ping','La conexión sigue abierta; esperando confirmación del canal.');
    }catch(error){reportError('session_setup',error,error?.httpStatus)}
  }
  function stop(){if(closed)return;try{if(dc&&dc.readyState==='open')dc.send(JSON.stringify({type:'session.close'}))}catch{}if(mic)mic.getTracks().forEach(t=>t.stop());if(pc)pc.close();closed=true;if(cfg)telemetry('session_closed',{sideEffects:0});post({type:'closed'})}
  document.getElementById('stop').addEventListener('click',stop);window.addEventListener('beforeunload',stop);void start();
})();
</script></body></html>`;

export function getM8LiveVoiceClientHtml(): string {
    // The static bootstrap is available only from staging. The authenticated
    // session broker remains separately gated and never exposes credentials.
    if (process.env.PING_ENVIRONMENT !== 'staging') {
        throw new AppError('Live voice is not enabled in this environment', 404);
    }
    return CLIENT_HTML;
}
