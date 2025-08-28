# Artivo Demo

Bu proje, Jambonz ve Elevenlabs Realtime API kullanarak sesli AI uygulaması geliştirmeyi gösteren bir demo uygulamasıdır. Uygulama, kullanıcıların belirtilen konumlar için hava durumu sorularını yanıtlayabilmesi için bir hava durumu REST API'sini kullanır.

## Authentication
To use this application, you'll need an Elevenlabs Agent ID that has access to the Realtime API. Set the Agent ID as an environment variable before launching the application, like so:

```bash
ELEVENLABS_AGENT_ID=<agent_id> npm start
```

Replace `<agent_id>` with your actual Elevenlabs Agent ID.

> Note: If you're using a private agent, you must also set the ELEVENLABS_API_KEY environment variable when starting the application.

## Environment Variables

This application supports the following environment variables:

### Required:
- `ELEVENLABS_API_KEY`: Your Elevenlabs API Key (for private agents)
- `ELEVENLABS_AGENT_ID_DEFAULT` or `ELEVENLABS_AGENT_ID`: Default Elevenlabs Agent ID (fallback)

### Dynamic Phone-to-Agent Mapping:
You can configure different agents for different phone numbers using this pattern:
- `PHONE_<normalized_phone>_AGENT_ID`: Agent ID for specific phone number

**Examples:**
- `PHONE_908502426449_AGENT_ID=agent_customer_service` - Customer service agent
- `PHONE_905551234567_AGENT_ID=agent_sales` - Sales agent  
- `PHONE_902125551234_AGENT_ID=agent_technical` - Technical support agent

**Phone Number Normalization:**
- `+90 850 242 64 49` → `908502426449`
- `0850 242 64 49` → `908502426449`
- `850 242 64 49` → `908502426449`

### Optional:
- `WS_PORT`: WebSocket server port (default: 3000)
- `LOGLEVEL`: Logging level (default: info)
- `MAIVO_API_URL`: Maivo API endpoint URL (default: https://api.maivo.com.tr/api/temsilci/kayit)
- `MAIVO_API_KEY`: Maivo API key (default: artivo_secure_api_key_2024_v1)

### Example with all variables:
```bash
ELEVENLABS_AGENT_ID_DEFAULT=your_default_agent_id \
ELEVENLABS_API_KEY=your_api_key \
PHONE_908502426449_AGENT_ID=customer_service_agent \
PHONE_905551234567_AGENT_ID=sales_agent \
MAIVO_API_URL=https://api.maivo.com.tr/api/temsilci/kayit \
MAIVO_API_KEY=your_maivo_api_key \
WS_PORT=3000 \
LOGLEVEL=info \
npm start
```

### Using .env file:
You can also create a `.env` file in the project root with the following content:

```env
# ElevenLabs Configuration
ELEVENLABS_AGENT_ID_DEFAULT=your_default_agent_id_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Dynamic Phone-to-Agent Mapping
PHONE_908502426449_AGENT_ID=customer_service_agent_id
PHONE_905551234567_AGENT_ID=sales_agent_id
PHONE_902125551234_AGENT_ID=technical_support_agent_id

# Server Configuration
WS_PORT=3000
LOGLEVEL=info

# Maivo API Configuration
MAIVO_API_URL=https://api.maivo.com.tr/api/temsilci/kayit
MAIVO_API_KEY=artivo_secure_api_key_2024_v1

# Docker Configuration (Optional)
WS_PORT_HOST=3000
WS_PORT_CONTAINER=3000
NGROK_AUTHTOKEN=your_ngrok_auth_token_here
```

Then simply run:
```bash
npm start
```

### Testing Agent Routing:
You can test the agent routing functionality:
```bash
npm run test-routing
```

This will show current agent configurations and test routing for sample phone numbers.

## Prerequisites
This application requires a Jambonz server running release `0.9.2-rc3` or above.

## Dynamic Agent Routing

The application now supports dynamic agent routing based on the called phone number. When a call comes in:

1. **Phone Number Normalization**: The called number is normalized to Turkish format (e.g., `908503351053`)
2. **Agent Lookup**: System searches for `PHONE_<normalized_number>_AGENT_ID` environment variable
3. **Fallback**: If no specific agent found, uses `ELEVENLABS_AGENT_ID_DEFAULT` or `ELEVENLABS_AGENT_ID`

### Routing Examples:
- Call to `+90 850 242 64 49` → Uses `PHONE_908502426449_AGENT_ID` agent
- Call to `0555 123 45 67` → Uses `PHONE_905551234567_AGENT_ID` agent  
- Call to unknown number → Uses default agent

### Debugging:
The application logs all agent configurations at startup and provides detailed routing information for each call.

## Configuring the Assistant
Elevenlabs requires the assistant to be configured before connecting to the agent. This application uses the `llm` verb with `llmOptions` to send the initial configuration to Elevenlabs. For details, refer to the Elevenlabs documentation: [Elevenlabs Agent Setup](https://elevenlabs.io/docs/conversational-ai/docs/agent-setup).

## Client tools
[Elevenlabs client tools](https://elevenlabs.io/docs/conversational-ai/customization/client-tools), setup a tool with promt to get weather

## ActionHook
Like many Jambonz verbs, the `llm` verb sends an `actionHook` with a final status when the verb completes. The payload includes a `completion_reason` property indicating why the `llm` session ended. Possible values for `completion_reason` are:

- Normal conversation end
- Connection failure
- Disconnect from remote end
- Server failure
- Server error

---

Ensure all environment variables are properly configured before starting the application. For detailed API references and documentation, visit the [Elevenlabs Documentation](https://elevenlabs.io/docs/conversational-ai/api-reference/conversational-ai/websocket).

