/**
 * Agent Router - Dinamik telefon numarası -> Agent ID eşleştirme sistemi
 * 
 * Environment variable format:
 * PHONE_<normalized_phone>_AGENT_ID=<agent_id>
 * 
 * Örnek:
 * PHONE_908503351053_AGENT_ID=agent123
 * PHONE_905551234567_AGENT_ID=agent456
 * 
 * Fallback: ELEVENLABS_AGENT_ID_DEFAULT
 */

/**
 * Telefon numarasını normalize et (sadece rakamlar)
 * @param {string} phoneNumber - Telefon numarası 
 * @returns {string} - Normalize edilmiş numara
 */
const normalizePhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return '';
  
  // Sadece rakamları al
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  
  // Türkiye için +90 veya 90 ile başlayan numaraları normalize et
  if (digitsOnly.startsWith('90') && digitsOnly.length === 12) {
    return digitsOnly; // 908503351053
  } else if (digitsOnly.startsWith('0') && digitsOnly.length === 11) {
    return '90' + digitsOnly.substring(1); // 05551234567 -> 905551234567
  } else if (digitsOnly.length === 10) {
    return '90' + digitsOnly; // 5551234567 -> 905551234567
  }
  
  return digitsOnly;
};

/**
 * Verilen telefon numarası için agent ID bul
 * @param {string} phoneNumber - Aranan telefon numarası
 * @param {object} logger - Logger instance
 * @returns {string|null} - Agent ID veya null
 */
const getAgentIdForPhoneNumber = (phoneNumber, logger) => {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    logger.info(`Looking for agent for phone: ${phoneNumber} -> normalized: ${normalizedPhone}`);
    
    if (!normalizedPhone) {
      logger.warn('Invalid phone number provided for agent lookup');
      return null;
    }
    
    // Environment variable'ı oluştur: PHONE_908503351053_AGENT_ID
    const envVarName = `PHONE_${normalizedPhone}_AGENT_ID`;
    const agentId = process.env[envVarName];
    
    if (agentId) {
      logger.info(`✅ Found agent mapping: ${envVarName} = ${agentId}`);
      return agentId;
    }
    
    logger.info(`❌ No agent mapping found for ${envVarName}`);
    return null;
    
  } catch (err) {
    logger.error({err, phoneNumber}, 'Error in getAgentIdForPhoneNumber');
    return null;
  }
};

/**
 * Fallback agent ID al
 * @param {object} logger - Logger instance
 * @returns {string|null} - Default agent ID
 */
const getDefaultAgentId = (logger) => {
  const defaultAgentId = process.env.ELEVENLABS_AGENT_ID_DEFAULT || process.env.ELEVENLABS_AGENT_ID;
  
  if (defaultAgentId) {
    logger.info(`Using default agent ID: ${defaultAgentId}`);
  } else {
    logger.error('No default agent ID found (ELEVENLABS_AGENT_ID_DEFAULT or ELEVENLABS_AGENT_ID)');
  }
  
  return defaultAgentId || null;
};

/**
 * Telefon numarası için en uygun agent ID'yi seç
 * @param {string} phoneNumber - Aranan telefon numarası 
 * @param {object} logger - Logger instance
 * @returns {string|null} - Seçilen agent ID
 */
const selectAgentForCall = (phoneNumber, logger) => {
  logger.info(`🔍 Selecting agent for inbound call to: ${phoneNumber}`);
  
  // Önce özel eşleştirme ara
  const specificAgentId = getAgentIdForPhoneNumber(phoneNumber, logger);
  if (specificAgentId) {
    return specificAgentId;
  }
  
  // Fallback agent kullan
  logger.info('No specific agent found, using default agent');
  return getDefaultAgentId(logger);
};

/**
 * Mevcut agent konfigürasyonlarını listele (debugging için)
 * @param {object} logger - Logger instance
 */
const listAgentConfigurations = (logger) => {
  const configurations = [];
  
  // Environment variables içinde PHONE_*_AGENT_ID pattern'ini ara
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('PHONE_') && key.endsWith('_AGENT_ID')) {
      const phoneNumber = key.replace('PHONE_', '').replace('_AGENT_ID', '');
      configurations.push({
        phone: phoneNumber,
        envVar: key,
        agentId: process.env[key]
      });
    }
  });
  
  logger.info({
    configurations,
    defaultAgent: process.env.ELEVENLABS_AGENT_ID_DEFAULT || process.env.ELEVENLABS_AGENT_ID
  }, `Found ${configurations.length} phone-to-agent configurations`);
  
  return configurations;
};

module.exports = {
  normalizePhoneNumber,
  getAgentIdForPhoneNumber,
  getDefaultAgentId,
  selectAgentForCall,
  listAgentConfigurations
}; 