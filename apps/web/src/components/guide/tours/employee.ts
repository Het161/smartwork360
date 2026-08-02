import type { Tour } from 'nextstepjs';
import type { Lang } from '@/i18n/provider';
import { TOUR_EVENTS } from './targets';
import { buildTour, type StepDef } from './shared';

const STEPS: StepDef[] = [
  {
    pose: 'wave',
    en: {
      title: "Namaste! I'm Saarthi",
      body: "I'm your guide. In 2 minutes I'll show you everything you need for your daily work.",
    },
    hi: {
      title: 'नमस्ते! मैं सारथी हूँ',
      body: 'मैं आपका मार्गदर्शक हूँ। 2 मिनट में रोज़ के काम की हर ज़रूरी चीज़ दिखाता हूँ।',
    },
  },
  {
    target: 'myKpis',
    side: 'bottom',
    pose: 'point-right',
    nextRoute: '/e/tasks',
    en: {
      title: 'What needs you today',
      body: 'Work assigned to you, what is due today, and how you are doing this month.',
    },
    hi: {
      title: 'आज आपको क्या करना है',
      body: 'आपको सौंपा गया काम, आज क्या देय है, और इस माह आपका प्रदर्शन।',
    },
  },
  {
    target: 'taskRow',
    side: 'bottom',
    pose: 'point-left',
    // Opening a task is what makes the NEXT step's target (the progress panel
    // inside the drawer) exist at all, so this step waits for the real click.
    action: TOUR_EVENTS.taskOpened,
    prevRoute: '/e/dashboard',
    en: {
      title: 'Open any task',
      body: 'Click a reference number to see its full story — every note and every change.',
    },
    hi: {
      title: 'कोई भी कार्य खोलें',
      body: 'संदर्भ संख्या पर क्लिक करें — उसकी पूरी कहानी, हर टिप्पणी और हर बदलाव।',
    },
  },
  {
    target: 'addProgress',
    side: 'left',
    pose: 'point-right',
    action: TOUR_EVENTS.progressAdded,
    nextRoute: '/e/assistant',
    en: {
      title: 'Report your progress',
      body: 'Slide the bar, write one line, and submit. It is sealed into the record instantly.',
    },
    hi: {
      title: 'अपनी प्रगति दर्ज करें',
      body: 'स्लाइडर खिसकाएँ, एक पंक्ति लिखें, और जमा करें। यह तुरंत रिकॉर्ड में दर्ज हो जाती है।',
    },
  },
  {
    target: 'assistantChips',
    side: 'top',
    pose: 'point-left',
    action: TOUR_EVENTS.assistantReplied,
    nextRoute: '/e/performance',
    prevRoute: '/e/tasks',
    en: {
      title: 'Just ask me',
      body: 'Tap a question — even in Hinglish. I answer from your real tasks, never a guess.',
    },
    hi: {
      title: 'मुझसे पूछिए',
      body: 'कोई सवाल दबाएँ — हिंग्लिश में भी। मैं आपके असली कार्यों से उत्तर देता हूँ, अनुमान नहीं।',
    },
  },
  {
    target: 'perfTrend',
    side: 'top',
    pose: 'point-right',
    prevRoute: '/e/assistant',
    en: {
      title: 'Your record',
      body: 'How often you finish on time. This is what builds your performance score.',
    },
    hi: {
      title: 'आपका रिकॉर्ड',
      body: 'आप कितनी बार समय पर काम पूरा करते हैं। इसी से आपका प्रदर्शन स्कोर बनता है।',
    },
  },
  {
    pose: 'celebrate',
    finish: true,
    en: {
      title: "You're ready",
      body: "That's everything. I'm always in the corner if you need me again.",
    },
    hi: {
      title: 'आप तैयार हैं',
      body: 'बस इतना ही। ज़रूरत पड़े तो मैं हमेशा कोने में मौजूद हूँ।',
    },
  },
];

export const EMPLOYEE_TOUR_ID = 'employee-tour';

export function employeeTour(lang: Lang): Tour {
  return buildTour(EMPLOYEE_TOUR_ID, 'EMPLOYEE', lang, STEPS);
}
