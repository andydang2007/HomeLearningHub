# Badge Copy (EN / ZH)

This file tracks the current badge name/description copy from `common/js/i18n.js`.

## Badge icon assets (`assets/images/badges/`)

Filenames match `badge_definitions.badge_code`. All `streak_*` tiers use **`streakcrystal.png`**.

| badge_code | PNG file |
|------------|----------|
| english_star | english_star.png |
| math_genius | math_genius.png |
| science_pro | science_pro.png |
| chinese_ace | chinese_ace.png |
| pinyin_pro | pinyin_pro.png |
| dictation_king | dictation_king.png |
| character_spirit | character_spirit.png |
| sharpshooter | sharpshooter.png |
| speed_record | speed_record.png |
| unlock_game | unlock_game.png |
| early_bird | early_bird.png |
| night_owl | night_owl.png |
| hat_trick | hat_trick.png |
| weekend_maniac | weekend_maniac.png |
| holiday_charge | holiday_charge.png |
| streak_3, streak_5, streak_10, streak_15, streak_30 | streakcrystal.png |

UI loads images via `common/js/badge-icons.js` (emoji fallback if file missing).

## 1) Sharpshooter / 神奇射手
- EN name: `Sharpshooter!`
- EN desc: `Great accuracy! Sharpshooter badge +1!`
- ZH name: `神奇射手！`
- ZH desc: `错题在1道以内，神奇射手徽章 +1！`

## 2) Speed Record / 极速突破
- EN name: `Speed Record!`
- EN desc: `Finished in {sec}s! Lightning fast!`
- ZH name: `极速突破！`
- ZH desc: `仅用 {sec}秒！闪电般的速度！`

## 3) Unlock Game / 解锁游戏
- EN name: `Unlock Game`
- ZH name: `解锁游戏`
- EN desc (perfect): `Perfect score! Game unlocked!`
- EN desc (streak): `2 quality sessions! Game unlocked!`
- EN desc (almost): `Great work! One more session to unlock the game!`
- ZH desc (perfect): `满分达成！游戏已解锁！`
- ZH desc (streak): `累计两次高质量完成！游戏已解锁！`
- ZH desc (almost): `表现不错！再完成一次高质量练习即可解锁游戏！`

## 4) Hat-trick / 全对三连
- EN name: `Hat-trick!`
- EN desc: `3 perfect scores in a row! On fire!`
- ZH name: `全对三连！`
- ZH desc: `连续 3 次完美通关！手感火热！`

## 5) Crystal / 毅力水晶
- EN name: `Crystal`
- EN desc: `Streak {n} days! Crystal +1!`
- ZH name: `毅力水晶`
- ZH desc: `连续打卡 {n} 天，水晶 +1！`

## 6) Early Bird / 早起鸟儿
- EN name: `Early Bird!`
- EN desc: `The early bird catches the worm!`
- ZH name: `早起鸟儿！`
- ZH desc: `一日之计在于晨！真棒！`

## 7) Night Owl / 小猫头鹰
- EN name: `Night Owl!`
- EN desc: `Studying late! Time to rest soon!`
- ZH name: `小猫头鹰！`
- ZH desc: `夜深了，做完赶紧休息哦！`

## 8) Holiday Charge / 假期充电
- EN name: `Holiday Charge!`
- EN desc: `Learning during holidays! Awesome!`
- ZH name: `假期充电！`
- ZH desc: `假期也不忘学习，给你点赞！`

## 9) Weekend Maniac / 周末狂人
- EN name: `Weekend Maniac!`
- EN desc: `10 badges this weekend! Amazing!`
- ZH name: `周末狂人！`
- ZH desc: `本周末狂揽 10 个徽章！太肝了！`

## 10) Chinese Ace / 华文小将
- EN name: `Chinese Ace`
- EN desc: `High quality practice! +2 gold coins!`
- ZH name: `华文小将`
- ZH desc: `完成高质量练习，金币 +2！`

## 11) Subject Generic (non-CN) / 其他科目通用
- EN desc: `Good job! Badge +1!`
- ZH desc: `表现很棒！徽章 +1！`
