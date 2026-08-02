import type { Tour } from 'nextstepjs';
import type { Lang } from '@/i18n/provider';
import { TOUR_EVENTS } from './targets';
import { buildTour, type StepDef } from './shared';

const STEPS: StepDef[] = [
  {
    pose: 'wave',
    en: {
      title: "Namaste! I'm Saarthi",
      body: "I'm your guide. In 2 minutes I'll show you how to run your whole organisation from here.",
    },
    hi: {
      title: 'नमस्ते! मैं सारथी हूँ',
      body: 'मैं आपका मार्गदर्शक हूँ। 2 मिनट में पूरा दफ़्तर यहीं से चलाना सिखाता हूँ।',
    },
  },
  {
    target: 'orgKpis',
    side: 'bottom',
    pose: 'point-right',
    en: {
      title: 'Your whole office, in one glance',
      body: 'Open tasks, how many are late, and how well deadlines are being met.',
    },
    hi: {
      title: 'पूरा दफ़्तर, एक नज़र में',
      body: 'खुले कार्य, कितने विलंबित हैं, और समय-सीमा कितनी निभाई जा रही है।',
    },
  },
  {
    target: 'deptTable',
    side: 'top',
    pose: 'point-left',
    // nextRoute fires when LEAVING this step, so it belongs on the step before
    // the one that needs the new page.
    nextRoute: '/a/fraud',
    en: {
      title: 'Which department needs you',
      body: 'Click the SLA % heading to sort. The lowest one needs attention first.',
    },
    hi: {
      title: 'किस विभाग को आपकी ज़रूरत है',
      body: 'SLA % पर क्लिक करके क्रमबद्ध करें। सबसे नीचे वाले पर पहले ध्यान दें।',
    },
  },
  {
    target: 'fraudAlerts',
    side: 'top',
    pose: 'point-right',
    prevRoute: '/a/overview',
    en: {
      title: 'The AI watches for misuse',
      body: 'Night-time edits, self-approvals and impossibly fast work all show up here.',
    },
    hi: {
      title: 'एआई गड़बड़ी पर नज़र रखता है',
      body: 'रात के बदलाव, स्वयं-स्वीकृति और असंभव तेज़ काम — सब यहाँ दिखते हैं।',
    },
  },
  {
    target: 'fraudAlertRow',
    side: 'bottom',
    pose: 'point-left',
    action: TOUR_EVENTS.alertOpened,
    nextRoute: '/a/audit',
    en: {
      title: 'Open the top alert',
      body: 'Click it to see the evidence — the exact records and why it was flagged.',
    },
    hi: {
      title: 'सबसे ऊपर वाली चेतावनी खोलें',
      body: 'साक्ष्य देखने के लिए क्लिक करें — कौन-से रिकॉर्ड और क्यों चिह्नित हुए।',
    },
  },
  {
    target: 'verifyChain',
    side: 'bottom',
    pose: 'point-right',
    action: TOUR_EVENTS.chainVerified,
    nextRoute: '/a/settings',
    prevRoute: '/a/fraud',
    en: {
      title: 'Prove nothing was changed',
      body: 'Press Verify chain. Every record is sealed to the one before it — tampering turns this red.',
    },
    hi: {
      title: 'साबित करें कि कुछ बदला नहीं',
      body: 'श्रृंखला सत्यापित करें दबाएँ। हर रिकॉर्ड पिछले से जुड़ा है — छेड़छाड़ पर यह लाल हो जाता है।',
    },
  },
  {
    target: 'slaEditor',
    side: 'right',
    pose: 'point-left',
    prevRoute: '/a/audit',
    en: {
      title: 'Set the deadline rules',
      body: 'Choose how many hours each priority gets, per department. Changes are audited.',
    },
    hi: {
      title: 'समय-सीमा के नियम तय करें',
      body: 'हर विभाग में हर प्राथमिकता को कितने घंटे मिलें, यह चुनें। बदलाव ऑडिट होते हैं।',
    },
  },
  {
    pose: 'celebrate',
    finish: true,
    en: {
      title: "You're ready",
      body: "That's the whole system. I'm always in the corner if you need me again.",
    },
    hi: {
      title: 'आप तैयार हैं',
      body: 'बस इतना ही। ज़रूरत पड़े तो मैं हमेशा कोने में मौजूद हूँ।',
    },
  },
];

export const ADMIN_TOUR_ID = 'admin-tour';

export function adminTour(lang: Lang): Tour {
  return buildTour(ADMIN_TOUR_ID, 'ADMIN', lang, STEPS);
}
