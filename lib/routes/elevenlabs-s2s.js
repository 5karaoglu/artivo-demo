const { getWeather, saveAppointmentRequest, saveMaivoRepresentativeRequest, agentRouter } = require("../utils");
const axios = require('axios');

const service = ({logger, makeService}) => {
  const svc = makeService({path: '/elevenlabs-s2s'});
  

  svc.on('session:new', (session, path) => {
    // Logger'ı hemen oluştur
    const sessionLogger = logger.child({call_sid: session.call_sid});
    
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      sessionLogger.error('CRITICAL: Missing env ELEVENLABS_API_KEY. Hanging up.');
      return session.hangup().send();
    }

    let selectedAgentId;

    if (session.direction === 'inbound') {
      // Dinamik agent seçimi - aranan numaraya göre
      selectedAgentId = agentRouter.selectAgentForCall(session.to, sessionLogger);
      
      // Başlangıçta agent konfigürasyonlarını logla (debugging için)
      agentRouter.listAgentConfigurations(sessionLogger);
    }

    // Agent ID'nin ayarlandığından emin ol, yoksa aramayı sonlandır.
    if (!selectedAgentId) {
      sessionLogger.error({
        direction: session.direction, 
        calledNumber: session.to,
        callerNumber: session.from
      }, 'No agent could be selected for the call. Hanging up.');
      return session.hangup().send();
    }

    session.locals = { ...session.locals,
      transcripts: [],
      logger: sessionLogger,
      toolCallMade: false, // Başarılı tool call yapıldı mı takibi
      hasUserInteraction: false, // Kullanıcı etkileşimi oldu mu takibi
      agentId: selectedAgentId, // ElevenLabs Agent ID
      calledNumber: session.to, // Aranan numara
      callerNumber: session.from // Arayan numara
    };
    session.locals.logger.info({
      session, 
      path, 
      from: session.from, 
      to: session.to,
      selectedAgentId,
      direction: session.direction
    }, `📞 New call session: ${session.call_sid}, from: ${session.from}, to: ${session.to}, direction: ${session.direction}`);
    session.locals.logger.info(`🤖 Inbound call to ${session.to}, routing to agent ${selectedAgentId}`);

    /* Giden arama (outbound) mantığı geçici olarak devre dışı bırakıldı
    else if (session.direction === 'outbound') {
      let callType;
      if (session.customerData && typeof session.customerData.call_type !== 'undefined') {
        callType = session.customerData.call_type.toString();
      } else {
        session.locals.logger.warn('Outbound call missing session.customerData.call_type. Proceeding without call_type.');
        // callType tanımsız kalacak, bu durum aşağıdaki if/else if bloklarında ele alınacak
      }
      
      session.locals.logger.info(`Outbound call detected with call_type: ${callType}`);
      if (callType === '1') {
        selectedAgentId = process.env.ELEVENLABS_AGENT_ID_OUTBOUND_TYPE1;
        if (!selectedAgentId) {
          session.locals.logger.error('Missing env ELEVENLABS_AGENT_ID_OUTBOUND_TYPE1 for outbound call_type 1. Hanging up.');
          return session.hangup().send();
        }
        session.locals.logger.info(`Selected Outbound Type 1 Agent ID: ${selectedAgentId}`);
      } else if (callType === '2') {
        selectedAgentId = process.env.ELEVENLABS_AGENT_ID_OUTBOUND_TYPE2;
        if (!selectedAgentId) {
          session.locals.logger.error('Missing env ELEVENLABS_AGENT_ID_OUTBOUND_TYPE2 for outbound call_type 2. Hanging up.');
          return session.hangup().send();
        }
        session.locals.logger.info(`Selected Outbound Type 2 Agent ID: ${selectedAgentId}`);
      } else {
        session.locals.logger.error(`Unknown or missing tag.call_type ('${callType}') for outbound call. Hanging up.`);
        return session.hangup().send();
      }
    } else {
      session.locals.logger.error(`Unknown call direction: '${session.direction}'. Hanging up.`);
      return session.hangup().send();
    }
    */
    
    session
      .on('/event', onEvent.bind(null, session))
      .on('/toolCall', onToolCall.bind(null, session))
      .on('/final', onFinal.bind(null, session))
      .on('close', onClose.bind(null, session))
      .on('error', onError.bind(null, session));

    session
      .answer()
      .pause({length: 1})
      .llm({
        vendor: 'elevenlabs',
        model: 'eleven_flash_v2_5',
        auth: {
          agent_id: selectedAgentId,
          api_key: apiKey
        },
        actionHook: '/final',
        eventHook: '/event',
        toolHook: '/toolCall',
        llmOptions: {
          input_sample_rate: 16000,
          output_sample_rate: 16000,
          conversation_initiation_client_data: {
            conversation_config_override: {
              agent: {
                // All overrides removed as per previous findings
              },
              tts: {
                // All overrides removed as per previous findings
              }
            },
          }
        }
      })
      .hangup()
      .send();
  });
};

const onFinal = async(session, evt) => {
  const {logger, isForwarding, toolCallMade, hasUserInteraction} = session.locals;
  logger.info(`got actionHook: ${JSON.stringify(evt)}`);
  const { completion_reason, error } = evt; // Destructure for easier access

  if (isForwarding) {
    logger.info('LLM session ended for call forwarding, letting dial command proceed.');
    return session.reply();
  }

  // Başarısız arama durumlarını kontrol et ve kaydet
  const isFailedCall = ['disconnect from remote end', 'server failure', 'server error'].includes(completion_reason) || error;
  
  if (isFailedCall && !toolCallMade) {
    logger.info('Call failed without successful tool call, logging failed call attempt');
    try {
      const failedCallData = {
        ad_soyad: 'Bilinmiyor',
        telefon: session.from,
        talep_turu: 'Başarısız Arama',
        plaka: '',
        sube_tercihi: '',
        arac_marka: '',
        sasi_no: '',
        yil: '',
        kilometre: '',
        butce: '',
        durum: 'basarisiz_arama',
        danisman_adi: '',
        iletisim_saati: new Date().toISOString(),
        kayit_zamani: new Date().toISOString(),
        hizmet_turu: '',
        tarih_saat_tercihi: '',
        aciklama: `Arama başarısız - Sebep: ${completion_reason || 'bilinmiyor'}`,
        conversation_id: session.locals.conversationId || null,
        agent_id: session.locals.agentId || null
      };
      
      await saveMaivoRepresentativeRequest(failedCallData, logger);
      logger.info('Failed call logged successfully');
    } catch (err) {
      logger.error({err}, 'Failed to log failed call attempt');
    }
  }
  // Normal tamamlanan aramalar için - kullanıcı konuştuysa ama tool call yapılmadıysa
  else if (!isFailedCall && hasUserInteraction && !toolCallMade) {
    logger.info('Call completed with user interaction but no tool call, logging incomplete call attempt');
    try {
      const incompleteCallData = {
        ad_soyad: 'Bilinmiyor',
        telefon: session.from,
        talep_turu: 'Tamamlanmamış Görüşme',
        plaka: '',
        sube_tercihi: '',
        arac_marka: '',
        sasi_no: '',
        yil: '',
        kilometre: '',
        butce: '',
        durum: 'tamamlanmamis_gorusme',
        danisman_adi: '',
        iletisim_saati: new Date().toISOString(),
        kayit_zamani: new Date().toISOString(),
        hizmet_turu: '',
        tarih_saat_tercihi: '',
        aciklama: `Kullanıcı etkileşimi var ama kayıt tamamlanmadı - Sebep: ${completion_reason || 'normal'}`,
        conversation_id: session.locals.conversationId || null,
        agent_id: session.locals.agentId || null
      };
      
      await saveMaivoRepresentativeRequest(incompleteCallData, logger);
      logger.info('Incomplete call logged successfully');
    } catch (err) {
      logger.error({err}, 'Failed to log incomplete call attempt');
    }
  }

  if (completion_reason === 'disconnect from remote end') {
   /*  logger.info('LLM session ended: disconnect from remote end. This might be an issue with ElevenLabs or an early user hangup.');
    session
      .say({text: 'Bağlantıda bir sorun oluştu veya çağrı erken sonlandırıldı. Lütfen daha sonra tekrar deneyin.'});
    session.hangup(); */
  } else if (['server failure', 'server error'].includes(completion_reason)) {
    logger.warn({error}, `LLM session ended with server error: ${completion_reason}`);
    if (error && error.code === 'rate_limit_exceeded') {
      let text = 'Üzgünüz, API hız limitlerini aştınız. ';
      const arr = error.message ? /try again in (\d+)/.exec(error.message) : null;
      if (arr) {
        text += `Lütfen ${arr[1]} saniye sonra tekrar deneyin.`;
      }
      session.say({text});
    } else {
      session.say({text: 'Üzgünüz, isteğiniz işlenirken sunucu taraflı bir hata oluştu.'});
    }
    session.hangup();
  } else {
    // Handles other completion reasons, including successful completion or unknown reasons.
    // The call should terminate as the LLM interaction is over.
    logger.info(`LLM session completed with reason: "${completion_reason || 'normal or unknown'}". Terminating call.`);
    //session.hangup();
  }
  session.reply(); // Send all queued verbs (say, hangup) and acknowledge the webhook.
};

const onEvent = async(session, evt) => {
  const {logger} = session.locals;
  logger.info(`got eventHook: ${JSON.stringify(evt)}`);
  
  // ElevenLabs conversation_id'sini yakala - detaylı logging ile
  if (evt.type === 'conversation_initiation_metadata') {
    logger.info('conversation_initiation_metadata event detected, attempting to extract conversation_id');
    
    if (evt.conversation_initiation_metadata_event?.conversation_id) {
      session.locals.conversationId = evt.conversation_initiation_metadata_event.conversation_id;
      logger.info(`✅ ElevenLabs conversation_id successfully captured: ${session.locals.conversationId}`);
    } else {
      logger.warn('⚠️ conversation_initiation_metadata_event found but conversation_id is missing');
      logger.warn('Event structure:', JSON.stringify(evt, null, 2));
    }
  }
  
  // Alternatif: Diğer event'lerde conversation_id arası
  if (!session.locals.conversationId && evt.conversation_id) {
    session.locals.conversationId = evt.conversation_id;
    logger.info(`✅ ElevenLabs conversation_id captured from ${evt.type} event: ${session.locals.conversationId}`);
  }
  
  // Kullanıcı konuşması yapıldığını takip et
  if (evt.type === 'user_transcript' && evt.user_transcription_event?.user_transcript) {
    session.locals.hasUserInteraction = true;
    logger.info('User interaction detected, marking hasUserInteraction as true');
  }
};

const onToolCall = async(session, evt) => {
  const {logger} = session.locals;
  logger.info({evt}, 'got toolHook');
  const {name, args, tool_call_id} = evt;

  switch (name) {
    case 'getWeather': {
      const {location, scale = 'celsius'} = args;
      logger.info({evt}, `got toolHook for ${name} with tool_call_id ${tool_call_id}`);

      try {
        const weather = await getWeather(location, scale, logger);
        logger.info({weather}, 'got response from weather API');
        const data = {
          type: 'client_tool_result',
          tool_call_id,
          result: weather,
          is_error: false
        };
        return session.sendToolOutput(tool_call_id, data);
      } catch (err) {
        logger.info({err}, 'error calling geocoding or weather API');
        const data = {
          type: 'client_tool_result',
          tool_call_id,
          result: 'Failed to get weather for location',
          is_error: true
        };
        return session.sendToolOutput(tool_call_id, data);
      }
    }

    case 'saveAppointmentRequest': {
      logger.info({args}, `got toolHook for saveAppointmentRequest with tool_call_id ${tool_call_id}`);
      try {
        const result = await saveAppointmentRequest(args, logger);
        const data = {
          type: 'client_tool_result',
          tool_call_id,
          result,
          is_error: false
        };
        return session.sendToolOutput(tool_call_id, data);
      } catch (err) {
        logger.error({err}, 'error saving appointment request');
        const data = {
          type: 'client_tool_result',
          tool_call_id,
          result: 'Failed to save appointment request.',
          is_error: true
        };
        return session.sendToolOutput(tool_call_id, data);
      }
    }

    case 'save_db': {
      logger.info({args}, `got toolHook for save_db with tool_call_id ${tool_call_id}`);
      try {
        // Telefon numarasını Jambonz session'ından al
        const dataWithPhone = {
          ...args,
          telefon: session.from, // Jambonz'dan gelen arayan numara
          conversation_id: session.locals.conversationId || null, // ElevenLabs conversation ID
          agent_id: session.locals.agentId || null // ElevenLabs Agent ID
        };
        
        logger.info(`📞 Calling saveMaivoRepresentativeRequest with conversation_id: ${session.locals.conversationId || 'NOT_AVAILABLE'}, agent_id: ${session.locals.agentId || 'NOT_AVAILABLE'}`);
        
        const result = await saveMaivoRepresentativeRequest(dataWithPhone, logger);
        
        // Başarılı kayıt yapıldığını işaretle
        session.locals.toolCallMade = true;
        
        const data = {
          type: 'client_tool_result',
          tool_call_id,
          result,
          is_error: false
        };
        return session.sendToolOutput(tool_call_id, data);
      } catch (err) {
        logger.error({err}, 'error saving data to database via Maivo API');
        const data = {
          type: 'client_tool_result',
          tool_call_id,
          result: 'Failed to save data to database.',
          is_error: true
        };
        return session.sendToolOutput(tool_call_id, data);
      }
    }

    /* Numara yönlendirme kullanılmadığı için devre dışı bırakıldı
    case 'forward_call': {
      logger.info({args}, `got toolHook for forward_call`);
      const calledNumber = session.to;
      logger.info(`Attempting to find forwarding number for incoming call to: ${calledNumber}`);
      let forwardingNumber;
      let i = 1;

      // Find which line this call came in on and get its forwarding number
      while (true) {
        const phoneNumber = process.env[`PHONE_NUMBER_${i}`];
        const fwdNumber = process.env[`FORWARDING_NUMBER_${i}`];
        
        logger.info(`Checking rule #${i}: PHONE_NUMBER_${i}=${phoneNumber}, FORWARDING_NUMBER_${i}=${fwdNumber}`);

        // Stop if we can't find a numbered phone number
        if (!phoneNumber) {
          logger.info('No more numbered phone lines to check. Breaking loop.');
          break;
        }
        if (calledNumber === phoneNumber) {
          logger.info(`Match found! Line ${calledNumber} matches PHONE_NUMBER_${i}.`);
          forwardingNumber = fwdNumber;
          break;
        }
        i++;
      }

      if (forwardingNumber) {
        session.locals.isForwarding = true;
        return session
          .say({
            text: 'Sizi operatöre bağlıyorum, lütfen bekleyin.'
          })
          .dial({
            callerId: '908503351053',
            target: [
              {
                type: 'phone',
                number: `+${forwardingNumber.replace('+', '')}`,
              }
            ]
          })
          .send();
      }

      // No match found, or no forwarding number configured for the match
      logger.warn(`No forwarding rule matched for ${session.to}. Informing LLM.`);
      const data = {
        type: 'client_tool_result',
        tool_call_id,
        result: 'Yönlendirme için uygun bir kural bulunamadı, görüşmeye devam et.',
        is_error: false
      };
      return session.sendToolOutput(tool_call_id, data);
    }
    */

    default: {
      logger.warn({evt}, `Received unhandled tool call: ${name}`);
      const data = {
        type: 'client_tool_result',
        tool_call_id,
        result: `Unknown tool ${name}`,
        is_error: true
      };
      return session.sendToolOutput(tool_call_id, data);
    }
  }
};

const onClose = async (session, code, reason) => {
  const {logger, toolCallMade, hasUserInteraction} = session.locals;
  logger.info({code, reason}, `session ${session.call_sid} closed`);
  
  // Beklenmeyen kapanma durumlarında başarısız arama kaydet
  // Code 1000 normal kapanma, 1001 endpoint gitti
  const isUnexpectedClose = code && code !== 1000 && code !== 1001;
  
  if (isUnexpectedClose && !toolCallMade) {
    const callType = hasUserInteraction ? 'Tamamlanmamış Görüşme' : 'Başarısız Arama';
    const durum = hasUserInteraction ? 'beklenmeyen_kapanis_etkilesim' : 'beklenmeyen_kapanis';
    
    logger.info(`Unexpected session close without successful tool call, logging ${callType.toLowerCase()} attempt`);
    try {
      const failedCallData = {
        ad_soyad: 'Bilinmiyor',
        telefon: session.from,
        talep_turu: callType,
        plaka: '',
        sube_tercihi: '',
        arac_marka: '',
        sasi_no: '',
        yil: '',
        kilometre: '',
        butce: '',
        durum: durum,
        danisman_adi: '',
        iletisim_saati: new Date().toISOString(),
        kayit_zamani: new Date().toISOString(),
        hizmet_turu: '',
        tarih_saat_tercihi: '',
        aciklama: `Beklenmeyen kapanış${hasUserInteraction ? ' (kullanıcı etkileşimi mevcut)' : ''} - Code: ${code}, Reason: ${reason || 'bilinmiyor'}`,
        conversation_id: session.locals.conversationId || null,
        agent_id: session.locals.agentId || null
      };
      
      await saveMaivoRepresentativeRequest(failedCallData, logger);
      logger.info('Failed call logged successfully in onClose');
    } catch (err) {
      logger.error({err}, 'Failed to log failed call attempt in onClose');
    }
  }
};

const onError = (session, err) => {
  const {logger} = session.locals;
  logger.info({err}, `session ${session.call_sid} received error`);
};

module.exports = service;
