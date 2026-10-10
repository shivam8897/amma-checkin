// Every sentence the parent hears, in every supported language.
// IMPORTANT before launch: have a native speaker of each language review these,
// and ideally record them in a real, warm human voice (see README → "Voice quality").
//
// Placeholders: {name} = how we address the parent, {child} = child's name, {med} = medicine name.

const SCRIPTS = {
  en: {
    voice: { language: 'en-IN', voice: 'Google.en-IN-Standard-A' },
    greeting: 'Namaste {name}. This is your morning call from Amma Check-in. {child} asked us to check on you every day.',
    greetingEvening: 'Good evening {name}. This is your evening call from Amma Check-in, on behalf of {child}.',
    recordedIntro: 'Namaste {name}. This is your daily check-in, recorded for you by {speaker}.',
    consent: 'We will call you at this time every day. If that is okay with you, press 1. If you do not want these calls, press 0.',
    consentNo: 'No problem. We will not call again, and we will let {child} know. Take care.',
    med: 'Have you taken your {med}? Press 1 for yes. Press 2 for no.',
    medYes: 'Very good.',
    medNo: 'No problem, please take it now. We will let {child} know.',
    meal: 'Have you had your breakfast? Press 1 for yes. Press 2 for no.',
    mealEvening: 'Have you had your dinner? Press 1 for yes. Press 2 for no.',
    mealYes: 'Good. Eating on time keeps you strong.',
    mealNo: 'Please eat something soon, even something small. We will let {child} know.',
    mood: 'How are you feeling today? Press 1 if you are feeling good. Press 2 if you are okay. Press 3 if you are not feeling well.',
    moodGood: 'Happy to hear that!',
    moodOkay: 'Okay. Please rest and drink some water.',
    moodUnwell: 'Please take care. We are informing {child} right now.',
    reading: 'If you checked your sugar today, type the reading and then press hash. Otherwise, just press hash.',
    readingThanks: 'Thank you, noted.',
    voiceNote: '{child} has sent you a message.',
    sosHint: 'Remember, you can press 9 at any time to ask your family to call you.',
    sosAck: 'Okay. We are telling {child} right now. They will call you very soon.',
    noInput: 'Sorry, I did not hear anything.',
    goodbye: 'Thank you. Please take care of yourself. We will talk again tomorrow. Namaste!',
  },

  hi: {
    voice: { language: 'hi-IN', voice: 'Google.hi-IN-Standard-A' },
    greeting: 'नमस्ते {name}। मैं अम्मा चेक-इन से बोल रही हूँ। {child} ने आपकी खैरियत पूछने के लिए यह कॉल लगवाई है।',
    greetingEvening: 'शुभ संध्या {name}। अम्मा चेक-इन से शाम की कॉल है, {child} की तरफ़ से।',
    recordedIntro: 'नमस्ते {name}। यह आपकी रोज़ की चेक-इन कॉल है, जिसे {speaker} ने आपके लिए अपनी आवाज़ में रिकॉर्ड किया है।',
    consent: 'यह कॉल रोज़ इसी समय आएगी। अगर आपको ठीक लगे तो 1 दबाइए। अगर आप ये कॉल नहीं चाहते, तो 0 दबाइए।',
    consentNo: 'कोई बात नहीं। हम दोबारा कॉल नहीं करेंगे और {child} को बता देंगे। अपना ख्याल रखिए।',
    med: 'क्या आपने {med} ले ली है? हाँ के लिए 1 दबाइए, नहीं के लिए 2 दबाइए।',
    medYes: 'बहुत अच्छे।',
    medNo: 'कोई बात नहीं, कृपया अभी ले लीजिए। हम {child} को बता देंगे।',
    meal: 'क्या आपने नाश्ता कर लिया है? हाँ के लिए 1 दबाइए, नहीं के लिए 2 दबाइए।',
    mealEvening: 'क्या आपने रात का खाना खा लिया है? हाँ के लिए 1 दबाइए, नहीं के लिए 2 दबाइए।',
    mealYes: 'बहुत अच्छा। समय पर खाना खाते रहिए।',
    mealNo: 'कृपया थोड़ा-सा कुछ खा लीजिए। हम {child} को बता देंगे।',
    mood: 'आज आप कैसा महसूस कर रहे हैं? अच्छा लग रहा हो तो 1, ठीक-ठाक हो तो 2, और तबीयत ठीक न हो तो 3 दबाइए।',
    moodGood: 'यह सुनकर बहुत अच्छा लगा!',
    moodOkay: 'ठीक है। थोड़ा आराम कीजिए और पानी पीते रहिए।',
    moodUnwell: 'अपना ध्यान रखिए। हम अभी {child} को बता रहे हैं।',
    reading: 'अगर आज आपने शुगर जाँची है, तो रीडिंग डालकर हैश दबाइए। नहीं तो सिर्फ़ हैश दबाइए।',
    readingThanks: 'धन्यवाद, नोट कर लिया।',
    voiceNote: '{child} ने आपके लिए एक संदेश भेजा है।',
    sosHint: 'याद रखिए, परिवार से बात करनी हो तो कभी भी 9 दबाइए।',
    sosAck: 'ठीक है, हम अभी {child} को खबर कर रहे हैं। वे जल्द ही आपको फ़ोन करेंगे।',
    noInput: 'माफ़ कीजिए, मुझे कुछ सुनाई नहीं दिया।',
    goodbye: 'धन्यवाद। अपना ख्याल रखिए। कल फिर बात करेंगे। नमस्ते!',
  },

  te: {
    voice: { language: 'te-IN', voice: 'Google.te-IN-Standard-A' },
    greeting: 'నమస్కారం {name}. నేను అమ్మ చెక్-ఇన్ నుండి మాట్లాడుతున్నాను. మీ యోగక్షేమాలు తెలుసుకోవడానికి {child} ఈ కాల్ ఏర్పాటు చేశారు.',
    greetingEvening: 'శుభ సాయంత్రం {name}. {child} తరపున అమ్మ చెక్-ఇన్ నుండి సాయంత్రం కాల్.',
    recordedIntro: 'నమస్కారం {name}. ఇది మీ రోజువారీ చెక్-ఇన్ కాల్. {speaker} మీ కోసం తమ గొంతుతో రికార్డ్ చేశారు.',
    consent: 'ఈ కాల్ ప్రతి రోజు ఇదే సమయానికి వస్తుంది. మీకు సమ్మతమైతే 1 నొక్కండి. వద్దనుకుంటే 0 నొక్కండి.',
    consentNo: 'పర్వాలేదు. మేము మళ్ళీ కాల్ చేయము, {child} కి తెలియజేస్తాము. జాగ్రత్తగా ఉండండి.',
    med: 'మీరు {med} వేసుకున్నారా? అవును అయితే 1 నొక్కండి. లేదు అయితే 2 నొక్కండి.',
    medYes: 'చాలా మంచిది.',
    medNo: 'పర్వాలేదు, దయచేసి ఇప్పుడే వేసుకోండి. మేము {child} కి చెబుతాము.',
    meal: 'మీరు టిఫిన్ చేశారా? అవును అయితే 1 నొక్కండి. లేదు అయితే 2 నొక్కండి.',
    mealEvening: 'మీరు రాత్రి భోజనం చేశారా? అవును అయితే 1 నొక్కండి. లేదు అయితే 2 నొక్కండి.',
    mealYes: 'చాలా మంచిది. వేళకు తినడం ఆరోగ్యానికి మంచిది.',
    mealNo: 'దయచేసి కొంచెమైనా ఏదైనా తినండి. మేము {child} కి చెబుతాము.',
    mood: 'ఈ రోజు మీకు ఎలా ఉంది? బాగుంటే 1, పర్వాలేదు అయితే 2, ఒంట్లో బాగోలేకపోతే 3 నొక్కండి.',
    moodGood: 'వినడానికి చాలా సంతోషంగా ఉంది!',
    moodOkay: 'సరే. కాస్త విశ్రాంతి తీసుకోండి, నీళ్ళు తాగుతూ ఉండండి.',
    moodUnwell: 'జాగ్రత్తగా ఉండండి. మేము ఇప్పుడే {child} కి తెలియజేస్తున్నాము.',
    reading: 'ఈ రోజు షుగర్ చూసుకుంటే, ఆ రీడింగ్ నొక్కి హ్యాష్ నొక్కండి. లేకపోతే హ్యాష్ మాత్రమే నొక్కండి.',
    readingThanks: 'ధన్యవాదాలు, నమోదు చేశాము.',
    voiceNote: '{child} మీ కోసం ఒక సందేశం పంపారు.',
    sosHint: 'గుర్తుంచుకోండి, కుటుంబంతో మాట్లాడాలంటే ఎప్పుడైనా 9 నొక్కండి.',
    sosAck: 'సరే, ఇప్పుడే {child} కి తెలియజేస్తున్నాము. వారు త్వరలో మీకు ఫోన్ చేస్తారు.',
    noInput: 'క్షమించండి, నాకు ఏమీ వినిపించలేదు.',
    goodbye: 'ధన్యవాదాలు. జాగ్రత్తగా ఉండండి. రేపు మళ్ళీ మాట్లాడుకుందాం. నమస్కారం!',
  },

  ta: {
    voice: { language: 'ta-IN', voice: 'Google.ta-IN-Standard-A' },
    greeting: 'வணக்கம் {name}. நான் அம்மா செக்-இன் இலிருந்து பேசுகிறேன். உங்கள் நலம் விசாரிக்க {child} இந்த அழைப்பை ஏற்பாடு செய்துள்ளார்.',
    greetingEvening: 'மாலை வணக்கம் {name}. {child} சார்பாக அம்மா செக்-இன் மாலை அழைப்பு.',
    recordedIntro: 'வணக்கம் {name}. இது உங்கள் தினசரி அழைப்பு. {speaker} உங்களுக்காக தங்கள் குரலில் பதிவு செய்துள்ளார்.',
    consent: 'இந்த அழைப்பு தினமும் இதே நேரத்தில் வரும். சம்மதம் என்றால் 1 அழுத்தவும். வேண்டாம் என்றால் 0 அழுத்தவும்.',
    consentNo: 'பரவாயில்லை. நாங்கள் மீண்டும் அழைக்க மாட்டோம், {child} க்கு தெரிவிப்போம். உடம்பை பார்த்துக்கொள்ளுங்கள்.',
    med: 'நீங்கள் {med} சாப்பிட்டீர்களா? ஆம் என்றால் 1 அழுத்தவும். இல்லை என்றால் 2 அழுத்தவும்.',
    medYes: 'மிகவும் நல்லது.',
    medNo: 'பரவாயில்லை, தயவுசெய்து இப்போதே சாப்பிடுங்கள். நாங்கள் {child} க்கு சொல்கிறோம்.',
    meal: 'காலை உணவு சாப்பிட்டீர்களா? ஆம் என்றால் 1 அழுத்தவும். இல்லை என்றால் 2 அழுத்தவும்.',
    mealEvening: 'இரவு உணவு சாப்பிட்டீர்களா? ஆம் என்றால் 1 அழுத்தவும். இல்லை என்றால் 2 அழுத்தவும்.',
    mealYes: 'நல்லது. நேரத்திற்கு சாப்பிடுவது உடலுக்கு நல்லது.',
    mealNo: 'தயவுசெய்து கொஞ்சமாவது ஏதாவது சாப்பிடுங்கள். நாங்கள் {child} க்கு சொல்கிறோம்.',
    mood: 'இன்று உங்கள் உடல்நிலை எப்படி இருக்கிறது? நன்றாக இருந்தால் 1, பரவாயில்லை என்றால் 2, உடம்பு சரியில்லை என்றால் 3 அழுத்தவும்.',
    moodGood: 'கேட்க மகிழ்ச்சியாக இருக்கிறது!',
    moodOkay: 'சரி. கொஞ்சம் ஓய்வு எடுங்கள், தண்ணீர் குடியுங்கள்.',
    moodUnwell: 'கவனமாக இருங்கள். நாங்கள் இப்போதே {child} க்கு தெரிவிக்கிறோம்.',
    reading: 'இன்று சர்க்கரை அளவு பார்த்திருந்தால், அந்த அளவை அழுத்தி ஹாஷ் அழுத்தவும். இல்லையென்றால் ஹாஷ் மட்டும் அழுத்தவும்.',
    readingThanks: 'நன்றி, குறித்துக்கொண்டோம்.',
    voiceNote: '{child} உங்களுக்காக ஒரு செய்தி அனுப்பியுள்ளார்.',
    sosHint: 'நினைவில் கொள்ளுங்கள், குடும்பத்தினருடன் பேச எப்போது வேண்டுமானாலும் 9 அழுத்தவும்.',
    sosAck: 'சரி, இப்போதே {child} க்கு தெரிவிக்கிறோம். அவர் விரைவில் உங்களை அழைப்பார்.',
    noInput: 'மன்னிக்கவும், எனக்கு எதுவும் கேட்கவில்லை.',
    goodbye: 'நன்றி. உடம்பை பார்த்துக்கொள்ளுங்கள். நாளை மீண்டும் பேசலாம். வணக்கம்!',
  },
};

// Lines a family member records in their OWN voice (the "voice studio" in the dashboard).
// Written in the first person, as a son or daughter would say them. They are suggestions:
// people should say them naturally, in their own words, but keep the "press 1 / press 2" part.
// Placeholders: {call} = what they call the parent ("Amma"), {speaker} = their own name, {med} = medicine.
// Lines missing here (consent, consentNo, recordedIntro) always use the standard voice.
const PERSONAL = {
  en: {
    greeting: "Good morning {call}! It's me, {speaker}. I'm checking on you, like every day.",
    greetingEvening: "Good evening {call}, it's {speaker} again. Just a quick check before you rest.",
    sosHint: 'If you need me, {call}, press 9 anytime and you will get a call right away.',
    med: '{call}, have you taken your {med}? Press 1 for yes, 2 for no.',
    medYes: 'Very good!',
    medNo: 'Please take it now, {call}.',
    meal: 'Have you had your breakfast, {call}? Press 1 for yes, 2 for no.',
    mealEvening: 'Have you had your dinner, {call}? Press 1 for yes, 2 for no.',
    mealYes: 'Good, that makes me happy.',
    mealNo: 'Please eat something now, even a little. For me.',
    mood: "How are you feeling today? Press 1 for good, 2 for okay, 3 if you're not feeling well.",
    moodGood: 'So happy to hear that!',
    moodOkay: 'Okay, please rest a little and drink some water.',
    moodUnwell: "Please take care, {call}. We'll talk very soon.",
    reading: 'If you checked your sugar today, type the number and press hash. Otherwise just press hash.',
    readingThanks: "Thank you, I've noted it.",
    voiceNote: 'And {call}, I have a message for you.',
    sosAck: "Don't worry, {call}. Your message is reaching me right now. You will get a call very soon.",
    noInput: "Sorry {call}, I didn't hear anything.",
    goodbye: "Thank you, {call}. Take care of yourself. I'll talk to you tomorrow!",
  },

  hi: {
    greeting: 'सुप्रभात {call}! मैं {speaker}। रोज़ की तरह आपका हाल जानना है।',
    greetingEvening: 'नमस्ते {call}, फिर से मैं {speaker}। आराम करने से पहले बस एक छोटी-सी बात।',
    sosHint: '{call}, कभी भी बात करनी हो तो 9 दबाइए, आपको तुरंत फ़ोन आएगा।',
    med: '{call}, क्या आपने {med} ले ली? हाँ के लिए 1, नहीं के लिए 2 दबाइए।',
    medYes: 'बहुत बढ़िया!',
    medNo: '{call}, प्लीज़ अभी ले लीजिए।',
    meal: '{call}, नाश्ता कर लिया? हाँ के लिए 1, नहीं के लिए 2 दबाइए।',
    mealEvening: '{call}, रात का खाना खा लिया? हाँ के लिए 1, नहीं के लिए 2 दबाइए।',
    mealYes: 'अच्छा है, सुनकर अच्छा लगा।',
    mealNo: 'थोड़ा-सा ही सही, अभी कुछ खा लीजिए। मेरे लिए।',
    mood: 'आज तबीयत कैसी है? अच्छी हो तो 1, ठीक-ठाक हो तो 2, और ठीक न हो तो 3 दबाइए।',
    moodGood: 'यह सुनकर बहुत खुशी हुई!',
    moodOkay: 'ठीक है, थोड़ा आराम कीजिए और पानी पीते रहिए।',
    moodUnwell: 'अपना ध्यान रखिए, {call}। बहुत जल्दी बात करते हैं।',
    reading: 'आज शुगर जाँची हो तो नंबर डालकर हैश दबाइए। नहीं तो सिर्फ़ हैश दबाइए।',
    readingThanks: 'धन्यवाद, नोट कर लिया।',
    voiceNote: 'और {call}, आपके लिए एक बात कहनी है।',
    sosAck: 'चिंता मत कीजिए {call}, आपका संदेश मुझ तक पहुँच रहा है। बहुत जल्दी फ़ोन आएगा।',
    noInput: 'माफ़ कीजिए {call}, कुछ सुनाई नहीं दिया।',
    goodbye: 'धन्यवाद {call}। अपना ख्याल रखिए। कल फिर बात करेंगे!',
  },

  te: {
    greeting: 'శుభోదయం {call}! నేను {speaker}ని. ఎప్పటిలాగే మీరు ఎలా ఉన్నారో తెలుసుకోవాలని.',
    greetingEvening: 'శుభ సాయంత్రం {call}, మళ్ళీ నేనే {speaker}ని. పడుకునే ముందు ఒక్క చిన్న మాట.',
    sosHint: '{call}, ఎప్పుడైనా అవసరమైతే 9 నొక్కండి, వెంటనే మీకు ఫోన్ వస్తుంది.',
    med: '{call}, {med} వేసుకున్నారా? అవును అయితే 1, లేదు అయితే 2 నొక్కండి.',
    medYes: 'చాలా మంచిది!',
    medNo: '{call}, దయచేసి ఇప్పుడే వేసుకోండి.',
    meal: '{call}, టిఫిన్ చేశారా? అవును అయితే 1, లేదు అయితే 2 నొక్కండి.',
    mealEvening: '{call}, భోజనం చేశారా? అవును అయితే 1, లేదు అయితే 2 నొక్కండి.',
    mealYes: 'మంచిది, వినడానికి సంతోషంగా ఉంది.',
    mealNo: 'కొంచెమైనా సరే, ఇప్పుడే ఏదైనా తినండి. నా కోసం.',
    mood: 'ఈ రోజు ఒంట్లో ఎలా ఉంది? బాగుంటే 1, పర్వాలేదు అయితే 2, బాగోలేకపోతే 3 నొక్కండి.',
    moodGood: 'వినడానికి చాలా సంతోషంగా ఉంది!',
    moodOkay: 'సరే, కాస్త విశ్రాంతి తీసుకోండి, నీళ్ళు తాగుతూ ఉండండి.',
    moodUnwell: 'జాగ్రత్తగా ఉండండి {call}. త్వరలోనే మాట్లాడుకుందాం.',
    reading: 'ఈ రోజు షుగర్ చూసుకుంటే, ఆ నంబర్ నొక్కి హ్యాష్ నొక్కండి. లేకపోతే హ్యాష్ మాత్రమే నొక్కండి.',
    readingThanks: 'థ్యాంక్స్, రాసుకున్నాను.',
    voiceNote: 'ఇంకా {call}, మీకు ఒక మాట చెప్పాలి.',
    sosAck: 'కంగారు పడకండి {call}, మీ సందేశం నాకు ఇప్పుడే అందుతోంది. త్వరలోనే మీకు ఫోన్ వస్తుంది.',
    noInput: 'సారీ {call}, ఏమీ వినిపించలేదు.',
    goodbye: 'థ్యాంక్స్ {call}. జాగ్రత్తగా ఉండండి. రేపు మళ్ళీ మాట్లాడుకుందాం!',
  },

  ta: {
    greeting: 'காலை வணக்கம் {call}! நான் {speaker}. எப்போதும் போல உங்கள் நலம் விசாரிக்கிறேன்.',
    greetingEvening: 'மாலை வணக்கம் {call}, மீண்டும் நான் {speaker}. தூங்கும் முன் ஒரு சின்ன விசாரிப்பு.',
    sosHint: '{call}, எப்போது தேவைப்பட்டாலும் 9 அழுத்துங்கள், உடனே உங்களுக்கு அழைப்பு வரும்.',
    med: '{call}, {med} சாப்பிட்டீர்களா? ஆம் என்றால் 1, இல்லை என்றால் 2 அழுத்துங்கள்.',
    medYes: 'மிகவும் நல்லது!',
    medNo: '{call}, தயவுசெய்து இப்போதே சாப்பிடுங்கள்.',
    meal: '{call}, காலை டிபன் சாப்பிட்டீர்களா? ஆம் என்றால் 1, இல்லை என்றால் 2 அழுத்துங்கள்.',
    mealEvening: '{call}, இரவு சாப்பாடு சாப்பிட்டீர்களா? ஆம் என்றால் 1, இல்லை என்றால் 2 அழுத்துங்கள்.',
    mealYes: 'நல்லது, கேட்க சந்தோஷமாக இருக்கிறது.',
    mealNo: 'கொஞ்சமாவது இப்போதே ஏதாவது சாப்பிடுங்கள். எனக்காக.',
    mood: 'இன்று உடம்பு எப்படி இருக்கிறது? நன்றாக இருந்தால் 1, பரவாயில்லை என்றால் 2, சரியில்லை என்றால் 3 அழுத்துங்கள்.',
    moodGood: 'கேட்க ரொம்ப சந்தோஷம்!',
    moodOkay: 'சரி, கொஞ்சம் ஓய்வு எடுங்கள், தண்ணீர் குடியுங்கள்.',
    moodUnwell: 'கவனமாக இருங்கள் {call}. சீக்கிரமே பேசலாம்.',
    reading: 'இன்று சர்க்கரை அளவு பார்த்திருந்தால், அந்த எண்ணை அழுத்தி ஹாஷ் அழுத்துங்கள். இல்லையென்றால் ஹாஷ் மட்டும் அழுத்துங்கள்.',
    readingThanks: 'நன்றி, குறித்துக்கொண்டேன்.',
    voiceNote: 'அப்புறம் {call}, உங்களிடம் ஒன்று சொல்ல வேண்டும்.',
    sosAck: 'கவலைப்படாதீர்கள் {call}, உங்கள் செய்தி இப்போதே எனக்கு வருகிறது. சீக்கிரமே உங்களுக்கு அழைப்பு வரும்.',
    noInput: 'மன்னிக்கவும் {call}, எதுவும் கேட்கவில்லை.',
    goodbye: 'நன்றி {call}. உடம்பை பார்த்துக்கொள்ளுங்கள். நாளை மீண்டும் பேசலாம்!',
  },
};

const LANGUAGES = {
  te: 'తెలుగు · Telugu',
  hi: 'हिन्दी · Hindi',
  ta: 'தமிழ் · Tamil',
  en: 'English',
};

function line(lang, key, vars = {}) {
  const pack = SCRIPTS[lang] || SCRIPTS.en;
  const text = pack[key] ?? SCRIPTS.en[key] ?? '';
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/** A line for a family member to say in their own voice (null if it stays in the standard voice). */
function personalLine(lang, key, vars = {}) {
  const text = (PERSONAL[lang] || PERSONAL.en)[key] ?? PERSONAL.en[key];
  if (text == null) return null;
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function voiceFor(lang) {
  return (SCRIPTS[lang] || SCRIPTS.en).voice;
}

module.exports = { SCRIPTS, PERSONAL, LANGUAGES, line, personalLine, voiceFor };
