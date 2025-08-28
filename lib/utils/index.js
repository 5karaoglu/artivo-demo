const axios = require('axios');

const getWeather = async (location, scale, logger) => {
  /* first we need lat and long, then we can get the weather for that location */
  let url = `https://geocoding-api.open-meteo.com/v1/search?name=${location}&count=1&language=en&format=json`;
  let response = await axios.get(url);

  if (!Array.isArray(response.data.results) || 0 == response.data.results.length) {
    throw new Error('location_not_found');
  }
  const {latitude:lat, longitude:lng, name, timezone, population, country} = response.data.results[0];

  logger.info({name, country, lat, lng, timezone, population}, 'got response from geocoding API');

  // eslint-disable-next-line max-len
  url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m&temperature_unit=${scale}`;

  logger.info(`calling weather API with url: ${url}`);
  response = await axios.get(url);
  return response.data;
}

const saveAppointmentRequest = async(data, logger) => {
  logger.info({data}, 'Saving appointment request data');
  /* 
    Bu noktada gelen veri veritabanına kaydedilir.
    Örnek olarak, bir veritabanı kütüphanesi (Mongoose, Sequelize vb.) kullanarak
    aşağıdaki gibi bir kayıt işlemi yapılabilir:
    await AppointmentModel.create(data);
  */
  console.log('Veri başarıyla alındı ve konsola yazdırıldı:', JSON.stringify(data, null, 2));
  
  // Şimdilik başarılı bir yanıt döndürüyoruz.
  return 'Randevu talebi başarıyla alınmıştır.';
};

const saveMaivoRepresentativeRequest = async(data, logger) => {
  logger.info({data}, 'Saving Maivo representative request');
  
  const url = process.env.MAIVO_API_URL || 'https://api.maivo.com.tr/api/temsilci/kayit';
  const apiKey = process.env.MAIVO_API_KEY || 'artivo_secure_api_key_2024_v1';
  
  // Environment variable kontrolü
  if (!process.env.MAIVO_API_KEY) {
    logger.warn('MAIVO_API_KEY environment variable not set, using default key');
  }
  
  if (!process.env.MAIVO_API_URL) {
    logger.warn('MAIVO_API_URL environment variable not set, using default URL');
  }
  
  // Zorunlu alanları kontrol et
  if (!data.ad_soyad || !data.telefon) {
    throw new Error('ad_soyad ve telefon alanları zorunludur');
  }
  
  // İsteği hazırla
  const requestData = {
    ad_soyad: data.ad_soyad,
    telefon: data.telefon
  };
  
  // Opsiyonel alanları ekle
  if (data.conversation_id) requestData.conversation_id = data.conversation_id;
  if (data.talep_turu) requestData.talep_turu = data.talep_turu;
  if (data.arac_marka) requestData.marka_model = data.arac_marka; // Agent 'arac_marka' gönderiyor, API 'marka_model' bekliyor
  if (data.plaka) requestData.plaka = data.plaka;
  if (data.agent_id) requestData.agent_id = data.agent_id;
  
  // Diğer alanları boş string olarak gönder (null, undefined, "yok" durumlarında)
  requestData.sube_tercihi = data.sube_tercihi && data.sube_tercihi !== 'yok' ? data.sube_tercihi : '';
  requestData.sasi_no = data.sasi_no && data.sasi_no !== 'yok' ? data.sasi_no : '';
  requestData.yil = data.yil && data.yil !== 'yok' ? data.yil : '';
  requestData.kilometre = data.kilometre && data.kilometre !== 'yok' ? data.kilometre : '';
  requestData.butce = data.butce && data.butce !== 'yok' ? data.butce : '';
  requestData.durum = data.durum || '';
  requestData.danisman_adi = data.danisman_adi && data.danisman_adi !== 'yok' ? data.danisman_adi : '';
  requestData.iletisim_saati = data.iletisim_saati || '';
  requestData.kayit_zamani = data.kayit_zamani || '';
  requestData.hizmet_turu = data.hizmet_turu || '';
  requestData.tarih_saat_tercihi = data.tarih_saat_tercihi || '';
  requestData.aciklama = data.aciklama || '';
  
  try {
    logger.info({url, requestData}, 'Calling Maivo API');
    
    const response = await axios.post(url, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      }
    });
    
    logger.info({response: response.data}, 'Got response from Maivo API');
    return response.data;
    
  } catch (err) {
    logger.error({err: err.message, response: err.response?.data}, 'Error calling Maivo API');
    
    if (err.response) {
      // API'den gelen hata yanıtı
      throw new Error(`Maivo API hatası: ${err.response.data?.message || err.response.statusText}`);
    } else {
      // Network veya diğer hatalar
      throw new Error(`Maivo API'ye bağlantı hatası: ${err.message}`);
    }
  }
};

const agentRouter = require('./agent-router');

module.exports = {
  getWeather,
  saveAppointmentRequest,
  saveMaivoRepresentativeRequest,
  agentRouter
};