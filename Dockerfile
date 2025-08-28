# Temel imaj olarak resmi Node.js 18 Alpine imajını kullanalım (küçük ve güvenli)
FROM node:18-alpine

# Uygulama için çalışma dizini oluşturalım
WORKDIR /app

# Bağımlılıkları kurmak için package.json ve package-lock.json dosyalarını kopyalayalım
# (package-lock.json varsa kullanılır, bu da tekrarlanabilir build'ler sağlar)
COPY package*.json ./

# Sadece üretim bağımlılıklarını kuralım
RUN npm install --omit=dev

# Uygulama kaynak kodunu kopyalayalım
COPY . .

# Uygulamanın kullandığı portu dışarıya açalım
# app.js'de process.env.WS_PORT || 3000 kullanılıyor.
# Ortam değişkeni ile portu değiştirebilmek için burada EXPOSE 3000 yapıyoruz.
# Çalıştırma sırasında docker run -p <host_port>:3000 -e WS_PORT=<istenen_port> şeklinde override edilebilir.
EXPOSE 3000

# Uygulamayı başlatalım
CMD ["npm", "start"] 