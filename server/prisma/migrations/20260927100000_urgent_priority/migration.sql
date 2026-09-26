-- أولوية "عاجل" بين العادي والطارئ لحجوزات الكشف الفني
ALTER TYPE "Urgency" ADD VALUE IF NOT EXISTS 'URGENT' BEFORE 'EMERGENCY';
