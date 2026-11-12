import { AppError } from '../utils/AppError';
import { M8_VOICE_PROTOCOL_VERSION } from './m8VoiceBootstrapProtocol';
import { M8_VOICE_PRESENTATION_BROWSER_SOURCE } from './m8VoicePresentation.service';
import { M8_VOICE_FAREWELL_BROWSER_SOURCE } from './m8VoiceFarewell';
import { VOICE_AURA_SOURCE, VOICE_PAGE_HEAD } from './m8LiveVoiceClient.service';
import { GEMINI_SAY_PREFIX } from './m8LiveVoiceGemini.service';

// The live voice page when Google speaks. Same screen, same handshake with the
// app and the same Vorian Core as the OpenAI page; only the voice service
// changes. Google hears the person, picks ping_core_turn, and says only what
// Vorian Core authorised. Audio Google produces on its own is never played.
// If Google cannot start, the page reloads itself with the OpenAI voice, and
// the app hands it the session again as it does on every load.
const CLIENT_HTML = `${VOICE_PAGE_HEAD}<script nonce="__M8_SCRIPT_NONCE__">
(function(){
  ${M8_VOICE_PRESENTATION_BROWSER_SOURCE}
  ${M8_VOICE_FAREWELL_BROWSER_SOURCE}
  const statusEl=document.getElementById('status'),hintEl=document.getElementById('hint'),orb=document.getElementById('orb'),retryEl=document.getElementById('retry');
${VOICE_AURA_SOURCE}
  const CONFIG_PROTOCOL=${M8_VOICE_PROTOCOL_VERSION},CONFIG_ATTEMPTS=12,CONFIG_INTERVAL=500,IN_RATE=16000,OUT_RATE=24000,SAY=${JSON.stringify(GEMINI_SAY_PREFIX)};
  let cfg=null,ws=null,mic=null,inCtx=null,outCtx=null,micNode=null,micSource=null,startedAt=Date.now(),configAttempts=0,currentStage='bootstrap',closed=false,failed=false,connected=false,providerSessionId=null;
  let turnSequence=0,activeTurnId=null,turnTranscript='',lastTranscriptAt=0,toolCallThisTurn=false,coreInFlight=false;
  let speechAllowed=false,speechStarted=false,generationDone=true,droppedAudio=false,assistantSpeaking=false,sources=[],nextPlayAt=0,saidText='',audioResponseCount=0,firstAudio=false;
  let greeted=false,micHeld=false,farewellPending=false;
  const cancelledCalls=new Set();
  const id=()=>{try{return crypto.randomUUID()}catch{return 'm8-'+Date.now()+'-'+Math.random().toString(16).slice(2)}};
  const post=(message)=>{try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(message))}catch{}};
  const setStatus=(text,hint)=>{statusEl.textContent=text;hintEl.textContent=hint||''};
  const safeText=(value,max)=>typeof value==='string'?value.replace(/Bearer\\s+[^\\s]+/ig,'Bearer [redacted]').replace(/https?:\\/\\/[^\\s]+/ig,'[url redacted]').replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)\\s*[:=]\\s*[^\\s,;]+/ig,'$1=[redacted]').trim().slice(0,max)||undefined:undefined;
  const telemetry=(event,extra={})=>{if(!cfg)return;const payload={voiceSessionId:cfg.voiceSessionId,deviceSessionId:cfg.deviceSessionId,event,atMs:Math.max(0,Date.now()-startedAt),sessionId:providerSessionId||undefined,turnId:activeTurnId||undefined,turnSequence,audioResponseCount:Math.min(100,audioResponseCount),assistantSpeaking,coreResultReady:speechAllowed,webrtcState:'gemini_ws',conversationPresent:typeof cfg.conversationId==='string',conversationId:cfg.conversationId,...extra};post({type:'telemetry',payload});fetch(cfg.apiUrl+'/agent/voice/live/telemetry',{method:'POST',headers:{Authorization:cfg.authorization,'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:event==='session_closed'}).catch(()=>{})};
  // Google reports what each reply cost; the server prices it with Google's list.
  const usageOf=(u)=>{const sum=(list,kind)=>(list||[]).filter(d=>d&&d.modality===kind).reduce((a,d)=>a+(d.tokenCount||0),0);const audioIn=sum(u.promptTokensDetails,'AUDIO'),audioOut=sum(u.responseTokensDetails,'AUDIO'),promptAll=u.promptTokenCount||0,responseAll=(u.responseTokenCount||0)+(u.thoughtsTokenCount||0);return {input_tokens:promptAll,output_tokens:responseAll,input_token_details:{text_tokens:Math.max(0,promptAll-audioIn),audio_tokens:audioIn},output_token_details:{text_tokens:Math.max(0,responseAll-audioOut),audio_tokens:audioOut}}};
  const reportUsage=(u)=>{if(!cfg||!u)return;fetch(cfg.apiUrl+'/agent/voice/live/usage',{method:'POST',headers:{Authorization:cfg.authorization,'Content-Type':'application/json'},body:JSON.stringify({voiceSessionId:cfg.voiceSessionId,kind:'voz_en_vivo',provider:'gemini',usage:usageOf(u)}),keepalive:true}).catch(()=>{})};
  const stage=(name,text,hint,extra={})=>{currentStage=name;aura.set(auraMode(name));setStatus(text,hint);post({type:'stage',stage:name});telemetry('voice_stage',{stage:name,...extra})};
  const errorDetails=(error)=>{const value=error||{};return {errorName:typeof value.name==='string'?value.name.slice(0,60):'Error',errorCode:typeof value.code==='string'||typeof value.code==='number'?String(value.code).slice(0,60):undefined,errorMessage:safeText(typeof value.message==='string'?value.message:'voice_session_failed',120)}};
  const withTimeout=(promise,ms,code)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(code)),ms);promise.then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})});
  const validConfig=(value)=>Boolean(value&&typeof value.apiUrl==='string'&&typeof value.authorization==='string'&&value.authorization.length>0&&typeof value.voiceSessionId==='string'&&typeof value.deviceSessionId==='string'&&(!value.protocolVersion||value.protocolVersion===CONFIG_PROTOCOL));
  const acceptConfig=()=>{const next=window.__PING_CONFIG;if(!validConfig(next)||cfg)return false;cfg=next;startedAt=Date.now();document.getElementById('write').hidden=cfg.canSwitchToText!==true;post({type:'config_ack',protocolVersion:CONFIG_PROTOCOL,handshakeId:cfg.handshakeId});stage('config_received','Configuración lista','Validando la sesión del usuario.');stage('auth_ready','Autenticación lista','Solicitando acceso al micrófono.');return true};
  const requestConfig=()=>{configAttempts+=1;post({type:'config_requested',protocolVersion:CONFIG_PROTOCOL,handshakeId:window.__PING_CONFIG?.handshakeId,attempt:configAttempts});stage('config_requested','Preparando Vorian','Solicitando configuración segura.',{detailCode:'attempt_'+configAttempts})};
  async function waitForConfig(){
    stage('webview_ready','Preparando Vorian','Iniciando el canal seguro.');
    window.addEventListener('ping-config',acceptConfig);
    if(acceptConfig())return;
    for(let attempt=0;attempt<CONFIG_ATTEMPTS&&!cfg;attempt+=1){requestConfig();await new Promise(resolve=>setTimeout(resolve,CONFIG_INTERVAL));acceptConfig()}
    window.removeEventListener('ping-config',acceptConfig);
    if(!cfg)throw new Error('voice_config_timeout');
  }
  const send=(value)=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(value))};
  const releaseMedia=()=>{try{if(micNode){micNode.onaudioprocess=null;micNode.disconnect()}if(micSource)micSource.disconnect()}catch{}if(mic)mic.getTracks().forEach(t=>t.stop());try{if(inCtx)inCtx.close()}catch{}try{if(outCtx)outCtx.close()}catch{}};
  // Google could not start: the same conversation continues with the OpenAI voice.
  const fallbackToOpenAI=(reason)=>{if(connected||closed||failed)return false;failed=true;telemetry('fallback',{detailCode:'gemini_to_openai',errorMessage:safeText(String(reason||'gemini_unavailable'),120),sideEffects:0});try{if(ws)ws.close(1000)}catch{}releaseMedia();setStatus('Preparando Vorian','Cambiando a la voz de respaldo.');setTimeout(()=>location.replace(location.pathname+'?provider=openai'),150);return true};
  function fail(stageName,error,httpStatus){if(failed||closed)return;if(!connected&&fallbackToOpenAI((stageName||currentStage)+': '+((error&&error.message)||'')))return;failed=true;const details=errorDetails(error);const failedStage=stageName||currentStage||'unknown';telemetry('error',{detailCode:failedStage,httpStatus,...details,sideEffects:0});post({type:'m8_diagnostic_error',stage:failedStage,details});retryEl.hidden=false;setStatus('No se pudo iniciar la voz','Falló la etapa '+failedStage+'. '+(details.errorCode||details.errorMessage||'Revisa la conexión e inténtalo nuevamente.'))}
  // --- What Vorian says: only audio Vorian Core authorised is played. ---
  const stopPlayback=()=>{for(const s of sources){try{s.onended=null;s.stop()}catch{}}sources=[];nextPlayAt=0;assistantSpeaking=false};
  const finishedSpeaking=()=>{if(sources.length||!generationDone)return;assistantSpeaking=false;micHeld=false;if(farewellPending){setTimeout(stop,300);return}if(!closed&&!failed&&currentStage!=='listening')stage('listening','Vorian está listo','Habla cuando quieras.',{detailCode:'audio_output_done',sideEffects:0})};
  const playChunk=(b64)=>{if(!outCtx)return;const bin=atob(b64),n=bin.length>>1;if(!n)return;const buffer=outCtx.createBuffer(1,n,OUT_RATE),out=buffer.getChannelData(0);for(let i=0;i<n;i+=1){let v=bin.charCodeAt(2*i)|(bin.charCodeAt(2*i+1)<<8);if(v>=32768)v-=65536;out[i]=v/32768}const node=outCtx.createBufferSource();node.buffer=buffer;node.connect(outCtx.destination);const at=Math.max(outCtx.currentTime+0.04,nextPlayAt);node.start(at);nextPlayAt=at+buffer.duration;sources.push(node);node.onended=()=>{sources=sources.filter(s=>s!==node);finishedSpeaking()};if(!assistantSpeaking){assistantSpeaking=true;audioResponseCount+=1;if(!firstAudio){firstAudio=true;telemetry('first_useful_audio',{sideEffects:0})}telemetry('assistant_audio_started',{sideEffects:0});stage('audio_output_started','Vorian está respondiendo','Puedes interrumpirlo cuando quieras.',{sideEffects:0})}};
  const allowSpeech=()=>{speechAllowed=true;speechStarted=false;generationDone=false;saidText=''};
  // A greeting or the morning summary: Google says this text as it is.
  const say=(text,cause)=>{allowSpeech();telemetry('response_create',{detailCode:cause,responseHasAudio:true,sideEffects:0});send({clientContent:{turns:[{role:'user',parts:[{text:SAY+' '+text}]}],turnComplete:true}})};
  const answer=(call,presentation)=>{if(cancelledCalls.has(call.id)){telemetry('input_ignored',{detailCode:'tool_call_cancelled_by_provider',sideEffects:0});return}allowSpeech();send({toolResponse:{functionResponses:[{id:call.id,name:call.name,response:{core_presentation:presentation}}]}});telemetry('function_call_output',{detailCode:'ping_core_turn_output',coreKind:['response','plan','clarification','unsupported','error'].includes(presentation.kind)?presentation.kind:undefined,coreAnswer:safeText(presentation.authorizedText,800),sideEffects:0})};
  const greet=()=>{if(greeted||closed||failed)return;greeted=true;micHeld=true;const briefing=typeof cfg?.briefing==='string'?cfg.briefing.trim().slice(0,1500):'';setTimeout(()=>{micHeld=false},briefing?45000:9000);const name=String((cfg&&cfg.firstName)||'').replace(/[^A-Za-zÀ-ÿ' -]/g,'').trim().slice(0,30);say(briefing||('Hola'+(name?' '+name:'')+', ¿cómo estás? ¿En qué te puedo ayudar hoy?'),briefing?'daily_briefing':'greeting')};
  // A goodbye said out loud: Vorian answers in one line, ends the voice once it has spoken and the app goes back to the chat list.
  const sayFarewell=(call,reason)=>{farewellPending=true;post({type:'farewell'});telemetry('voice_stage',{stage:'farewell_reason',detailCode:reason,sideEffects:0});telemetry('voice_stage',{stage:'farewell',detailCode:'closed_by_voice',sideEffects:0});const presentation={kind:'farewell',authorizedText:'Listo, hasta luego.'};if(call)answer(call,presentation);else say(presentation.authorizedText,'farewell');setTimeout(stop,6000)};
  // --- Vorian Core: the same brain as the chat. ---
  const requestCore=async(input,turnId)=>{const body={input,channel:'mobile_voice',voiceInputSource:'transcript',locale:cfg.locale,timezone:cfg.timezone,conversationId:cfg.conversationId,currentCommitmentId:cfg.currentCommitmentId};const response=await withTimeout(fetch(cfg.apiUrl+'/agent/turn',{method:'POST',headers:{Authorization:cfg.authorization,'Content-Type':'application/json','Idempotency-Key':'m8-voice-'+cfg.voiceSessionId+'-'+turnId},body:JSON.stringify(body)}),20000,'core_request_timeout');return {response,text:await response.text()}};
  async function callCore(input,call,turnId){
    const startedCore=Date.now();
    telemetry('core_request_started',{turnId,transcript:safeText(input,500),detailCode:'agent_turn_started',sideEffects:0});
    stage('core_request_started','Vorian está pensando','Consultando el mismo Vorian Core.',{sideEffects:0});
    const {response,text}=await requestCore(input,turnId);
    let result=null;try{result=JSON.parse(text)}catch{}
    stage('core_response_received',response.ok?'Respuesta recibida':'Core no disponible','Preparando la respuesta de voz.',{httpStatus:response.status,sideEffects:0});
    if(!response.ok)throw new Error('core_'+response.status);
    const presentation=buildM8VoiceCorePresentation(result||{kind:'error',status:'unavailable'});
    telemetry('core_disposition',{turnId,coreKind:['response','plan','clarification','unsupported','error'].includes(presentation.kind)?presentation.kind:undefined,coreAnswer:safeText(presentation.authorizedText,800),httpStatus:response.status,detailCode:'agent_turn_completed',sideEffects:0});
    telemetry('core_response_received',{turnId,httpStatus:response.status,latencyMs:Math.min(120000,Date.now()-startedCore),detailCode:'agent_turn_completed',sideEffects:0});
    if(call)answer(call,presentation);else say(presentation.authorizedText,'core_result_without_tool');
  }
  const usable=(value)=>typeof value==='string'&&value.trim().length>0&&!/^[\\s.,!?¿¡-]*$/.test(value);
  // One person turn: what they said (Google's own transcription first), then a goodbye or Vorian Core.
  async function handleTurn(call,args){
    const turnId=activeTurnId||id();
    // The transcription can trail the tool call by a moment.
    const waitUntil=Date.now()+900;while(Date.now()<waitUntil&&Date.now()-lastTranscriptAt<350)await new Promise(r=>setTimeout(r,80));
    const heard=turnTranscript.trim();activeTurnId=null;turnTranscript='';
    if(heard)telemetry('transcript_received',{turnId,transcript:safeText(heard,500),detailCode:'input_transcription_completed',sideEffects:0});
    const providerInput=typeof args?.input==='string'?args.input.trim():'';
    const selected=usable(heard)?heard:usable(providerInput)?providerInput:'';
    if(!selected){telemetry('input_ignored',{turnId,detailCode:'missing_core_input',sideEffects:0});if(call)send({toolResponse:{functionResponses:[{id:call.id,name:call.name,response:{core_presentation:{kind:'clarification',authorizedText:''}}}]}});return}
    telemetry('transcript_received',{turnId,transcript:safeText(selected,500),detailCode:usable(heard)?'input_transcription_selected_for_core':'provider_tool_input_fallback',sideEffects:0});
    // A TV, someone else in the room, or the person talking to somebody else: Vorian stays quiet and keeps listening.
    if(args?.intent==='not_for_vorian'){telemetry('input_ignored',{turnId,transcript:safeText(selected,500),detailCode:'not_addressed_to_vorian',sideEffects:0});if(call)send({toolResponse:{functionResponses:[{id:call.id,name:call.name,response:{core_presentation:{kind:'clarification',authorizedText:''}}}]}});stage('listening','Vorian está listo','Habla cuando quieras.',{detailCode:'not_addressed_to_vorian',sideEffects:0});return}
    if(args?.intent==='end_conversation'||isVoiceFarewell(selected)){sayFarewell(call,args?.intent==='end_conversation'?'intent':'phrase');return}
    if(coreInFlight){telemetry('input_ignored',{turnId,detailCode:'core_turn_already_in_flight',sideEffects:0});return}
    coreInFlight=true;
    try{await callCore(selected,call,turnId)}finally{coreInFlight=false}
  }
  function onServerMessage(m){
    if(m.setupComplete){connected=true;telemetry('session_connected',{detailCode:'gemini_live',sideEffects:0});stage('session_connected','Vorian está escuchando','Habla cuando quieras.');stage('listening','Vorian está listo','Habla cuando quieras.');startMic();greet();return}
    if(m.goAway){telemetry('voice_stage',{stage:'provider_go_away',detailCode:'gemini_go_away',sideEffects:0})}
    if(m.usageMetadata)reportUsage(m.usageMetadata);
    if(m.toolCallCancellation){for(const callId of m.toolCallCancellation.ids||[])cancelledCalls.add(callId)}
    const sc=m.serverContent;
    if(sc){
      if(sc.interrupted){if(assistantSpeaking||sources.length){telemetry('barge_in',{cancelCause:'speech_started_while_assistant_speaking',sideEffects:0});stage('barge_in_detected','Vorian te escucha','Interrumpiendo la respuesta anterior.',{sideEffects:0})}if(!farewellPending){stopPlayback();speechAllowed=false;generationDone=true}}
      if(sc.inputTranscription&&typeof sc.inputTranscription.text==='string'&&sc.inputTranscription.text){if(!activeTurnId){activeTurnId=id();turnSequence+=1;toolCallThisTurn=false;droppedAudio=false;telemetry('speech_started',{sideEffects:0})}turnTranscript+=sc.inputTranscription.text;lastTranscriptAt=Date.now()}
      if(sc.outputTranscription&&typeof sc.outputTranscription.text==='string'&&speechAllowed)saidText+=sc.outputTranscription.text;
      for(const part of (sc.modelTurn&&sc.modelTurn.parts)||[]){const data=part&&part.inlineData&&part.inlineData.data;if(!data)continue;if(speechAllowed){speechStarted=true;playChunk(data)}else if(!droppedAudio){droppedAudio=true;telemetry('error',{detailCode:'audio_before_core_result',sideEffects:0})}}
      if(sc.turnComplete){
        if(speechAllowed&&speechStarted){speechAllowed=false;generationDone=true;telemetry('voice_stage',{stage:'realtime_output_transcript_done',detailCode:'gemini_turn_complete',realtimeOutputText:safeText(saidText,800),sideEffects:0});saidText='';finishedSpeaking()}
        // Google answered on its own instead of asking Vorian Core: that audio was
        // dropped, and Vorian Core answers what the person said.
        else if(droppedAudio&&!toolCallThisTurn&&usable(turnTranscript)&&!coreInFlight){droppedAudio=false;telemetry('voice_stage',{stage:'core_without_tool_call',detailCode:'gemini_spoke_without_tool',sideEffects:0});void handleTurn(null,null).catch(error=>fail('core_request',error))}
      }
    }
    if(m.toolCall){for(const call of m.toolCall.functionCalls||[]){toolCallThisTurn=true;speechAllowed=false;stopPlayback();if(call.name!=='ping_core_turn'){send({toolResponse:{functionResponses:[{id:call.id,name:call.name,response:{error:'unknown_tool'}}]}});continue}stage('user_turn_ready','Vorian te escuchó','Preparando la respuesta.',{sideEffects:0});void handleTurn(call,call.args||{}).catch(error=>fail('core_request',error))}}
  }
  // --- The microphone, sent to Google as 16 kHz audio. ---
  const toBase64=(bytes)=>{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(s)};
  function startMic(){
    try{
      try{inCtx=new AudioContext({sampleRate:IN_RATE})}catch{inCtx=new AudioContext()}
      const ratio=inCtx.sampleRate/IN_RATE;
      micSource=inCtx.createMediaStreamSource(mic);micNode=inCtx.createScriptProcessor(2048,1,1);
      micNode.onaudioprocess=(e)=>{if(closed||failed||micHeld||farewellPending||!ws||ws.readyState!==1)return;const input=e.inputBuffer.getChannelData(0),n=Math.floor(input.length/ratio),pcm=new Int16Array(n);for(let i=0;i<n;i+=1){const v=Math.max(-1,Math.min(1,input[Math.floor(i*ratio)]));pcm[i]=v<0?v*32768:v*32767}send({realtimeInput:{audio:{data:toBase64(new Uint8Array(pcm.buffer)),mimeType:'audio/pcm;rate=16000'}}})};
      micSource.connect(micNode);micNode.connect(inCtx.destination);
      if(inCtx.state==='suspended')inCtx.resume().catch(()=>{});
      telemetry('audio_transport',{detailCode:'microphone_streaming',audioState:'rate_'+Math.round(inCtx.sampleRate),sideEffects:0});
    }catch(error){fail('microphone_stream',error)}
  }
  async function start(){
    try{
      await waitForConfig();
      if(!navigator.mediaDevices?.getUserMedia||typeof WebSocket!=='function'||typeof AudioContext!=='function')throw new Error('audio_unavailable');
      stage('permission_request','Solicitando micrófono','Acepta el permiso para hablar con Vorian.');
      mic=await withTimeout(navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}}),15000,'microphone_permission_timeout');
      stage('permission_granted','Micrófono listo','Preparando conexión de voz.');
      try{outCtx=new AudioContext({sampleRate:OUT_RATE})}catch{outCtx=new AudioContext()}
      if(outCtx.state==='suspended')outCtx.resume().catch(()=>{});
      stage('voice_session_requested','Autenticando voz','Abriendo una sesión segura con Vorian.');
      const response=await withTimeout(fetch(cfg.apiUrl+'/agent/voice/live/gemini/session',{method:'POST',headers:{Authorization:cfg.authorization,'Content-Type':'application/json'},body:JSON.stringify({voiceSessionId:cfg.voiceSessionId,deviceSessionId:cfg.deviceSessionId,conversationId:cfg.conversationId,currentCommitmentId:cfg.currentCommitmentId,locale:cfg.locale,timezone:cfg.timezone})}),20000,'session_request_timeout');
      stage('voice_session_received',response.ok?'Sesión aceptada':'Sesión rechazada','Finalizando conexión.',{httpStatus:response.status});
      let result=null;try{result=await response.json()}catch{}
      if(!response.ok||!result?.token||!result?.url||!result?.model)throw Object.assign(new Error((result&&result.error)||'live_session_failed'),{code:'http_'+response.status});
      providerSessionId='gemini-'+String(result.model).slice(0,40);
      stage('provider_connecting','Conectando la voz','Completando la conexión segura.');
      ws=new WebSocket(result.url+'?access_token='+encodeURIComponent(result.token));ws.binaryType='arraybuffer';
      const setupTimer=setTimeout(()=>{if(!connected)fail('provider_setup',new Error('provider_session_timeout'))},15000);
      ws.onopen=()=>{send({setup:{model:'models/'+result.model}})};
      ws.onmessage=(event)=>{let m;try{m=JSON.parse(typeof event.data==='string'?event.data:new TextDecoder().decode(event.data))}catch{telemetry('error',{detailCode:'provider_event_invalid_json',sideEffects:0});return}if(m.setupComplete)clearTimeout(setupTimer);try{onServerMessage(m)}catch(error){telemetry('error',{detailCode:'provider_event_handler',...errorDetails(error),sideEffects:0})}};
      ws.onerror=()=>{telemetry('error',{detailCode:'provider_socket_error',sideEffects:0});if(!connected)fail('provider_socket',new Error('provider_socket_error'))};
      ws.onclose=(event)=>{clearTimeout(setupTimer);if(closed)return;const reason=safeText(String(event.reason||''),100);telemetry('voice_stage',{stage:'provider_closed',detailCode:'code_'+event.code,errorMessage:reason,sideEffects:0});if(farewellPending){stop();return}fail('provider_closed',Object.assign(new Error(reason||'provider_closed'),{code:'ws_'+event.code}))};
    }catch(error){fail(currentStage,error,error?.httpStatus)}
  }
  function stop(){if(closed)return;closed=true;stopPlayback();try{if(ws)ws.close(1000)}catch{}releaseMedia();if(cfg)telemetry('session_closed',{sideEffects:0});setStatus('Conversación terminada','');post({type:'closed'})}
  document.getElementById('stop').addEventListener('click',stop);document.getElementById('write').addEventListener('click',()=>{post({type:'write'});stop()});retryEl.addEventListener('click',()=>{post({type:'retry'});if(!window.ReactNativeWebView)location.reload()});window.addEventListener('beforeunload',stop);post({type:'webview_ready',protocolVersion:CONFIG_PROTOCOL});void start();
})();
</script></body></html>`;

export function getM8LiveVoiceGeminiClientHtml(scriptNonce = 'm8-test-nonce'): string {
    if (process.env.PING_ENVIRONMENT !== 'production' || process.env.M8_LIVE_VOICE_ENABLED !== 'true') {
        throw new AppError('Live voice is not enabled in this environment', 404);
    }
    return CLIENT_HTML.replace('__M8_SCRIPT_NONCE__', scriptNonce);
}
