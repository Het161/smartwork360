import type { Tour } from 'nextstepjs';
import type { Lang } from '@/i18n/provider';
import { TOUR_EVENTS } from './targets';
import { buildTour, type StepDef } from './shared';

const STEPS: StepDef[] = [
  {
    pose: 'wave',
    en: {
      title: "Namaste! I'm Saarthi",
      body: "I'm your guide. In 2 minutes I'll show you how to look after your team from here.",
    },
    hi: {
      title: 'नमस्ते! मैं सारथी हूँ',
      body: 'मैं आपका मार्गदर्शक हूँ। 2 मिनट में अपनी टीम सँभालना सिखाता हूँ।',
    },
  },
  {
    target: 'teamKpis',
    side: 'bottom',
    pose: 'point-right',
    en: {
      title: "Your team's day",
      body: 'Total work, what is late, and how fast tasks are being finished.',
    },
    hi: {
      title: 'आपकी टीम का दिन',
      body: 'कुल काम, क्या विलंबित है, और कार्य कितनी तेज़ी से पूरे हो रहे हैं।',
    },
  },
  {
    target: 'moraleGauge',
    side: 'bottom',
    pose: 'point-left',
    en: {
      title: 'How the team is feeling',
      body: 'The AI reads the notes people write on tasks and shows a 14-day mood average.',
    },
    hi: {
      title: 'टीम का मनोबल',
      body: 'एआई कार्यों पर लिखी टिप्पणियाँ पढ़कर 14 दिन का औसत भाव दिखाता है।',
    },
  },
  {
    target: 'burnoutList',
    side: 'left',
    pose: 'point-right',
    nextRoute: '/m/board',
    en: {
      title: 'Who is overloaded',
      body: 'Each person gets a score and a suggested action. Worth checking once a week.',
    },
    hi: {
      title: 'कौन अधिक बोझ में है',
      body: 'हर व्यक्ति का स्कोर और सुझाई गई कार्रवाई। सप्ताह में एक बार देखें।',
    },
  },
  {
    target: 'kanbanBoard',
    side: 'top',
    pose: 'point-right',
    action: TOUR_EVENTS.taskMoved,
    prevRoute: '/m/dashboard',
    en: {
      title: 'Move a card',
      body: 'Drag any card to the next column. The change saves instantly and is recorded.',
    },
    hi: {
      title: 'कोई कार्ड खिसकाएँ',
      body: 'किसी कार्ड को अगले कॉलम में खींचें। बदलाव तुरंत सहेजा और दर्ज होता है।',
    },
  },
  {
    target: 'newTaskBtn',
    side: 'bottom-left',
    pose: 'point-right',
    nextRoute: '/m/reviews',
    en: {
      title: 'Assign work fairly',
      body: "When you pick a person, you see how much they're already carrying.",
    },
    hi: {
      title: 'काम संतुलित रूप से बाँटें',
      body: 'व्यक्ति चुनते समय दिखता है कि उन पर पहले से कितना भार है।',
    },
  },
  {
    target: 'reviewQueue',
    side: 'top',
    pose: 'point-left',
    prevRoute: '/m/board',
    en: {
      title: 'Approve or send back',
      body: 'Your note is required, and it is written permanently into the record.',
    },
    hi: {
      title: 'स्वीकृत करें या वापस भेजें',
      body: 'टिप्पणी अनिवार्य है, और वह स्थायी रूप से रिकॉर्ड में दर्ज होती है।',
    },
  },
  {
    pose: 'celebrate',
    finish: true,
    en: {
      title: "You're ready",
      body: "That's your whole team view. I'm in the corner whenever you need me.",
    },
    hi: {
      title: 'आप तैयार हैं',
      body: 'यही आपकी पूरी टीम का दृश्य है। ज़रूरत पड़े तो मैं कोने में हूँ।',
    },
  },
];

export const MANAGER_TOUR_ID = 'manager-tour';

export function managerTour(lang: Lang): Tour {
  return buildTour(MANAGER_TOUR_ID, 'MANAGER', lang, STEPS);
}
