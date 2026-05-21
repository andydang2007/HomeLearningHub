const fs = require('fs');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');

// 🔐 请替换为你自己的 Supabase 项目凭证
const SUPABASE_URL = 'https://dtrbawiimrfidsnxlfmw.supabase.co';
const SUPABASE_KEY = 'left blank'; 
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 解析并灌入大一统题库表 (English, Math, Science, 华文)
async function importQuestions(filePath, subjectName) {
  const results = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        // 🛡️ 终极拦截：如果这行的题目或者 Topic 是空的（比如文件末尾的空行），直接跳过！
        if (!data.Question && !data.question) return;
        if (!data.Topic && !data.topic) return;

        results.push({
          grade: data.Grade || data.grade,
          subject: subjectName,
          topic: data.Topic || data.topic,
          type: data.Type || data.type,
          question_text: data.Question || data.question,
          options: data.Options || data.options || null,
          correct_answer: data.Correct_Answer || data['Correct Answer'] || data.correct_answer,
          term: data.Term || data.term || null
        });
      })
      .on('end', async () => {
        console.log(`[读取完成] ${subjectName} 共 ${results.length} 条数据，准备灌入数据库...`);
        // 分批插入（每次50条，防止网络超载）
        for (let i = 0; i < results.length; i += 50) {
          const chunk = results.slice(i, i + 50);
          const { error } = await supabase.from('questions').insert(chunk);
          if (error) console.error(`[灌入失败] 分批 ${i} 错误:`, error.message);
        }
        console.log(`[🥳 灌入成功] ${subjectName} 数据全量同步完毕。`);
        resolve();
      });
  });
}

// 解析并灌入独立生字库表 (生字.csv -> 转为 JSONB 数组)
async function importChineseDict(filePath) {
  const results = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        // 清洗 Parts，将 "八,刀,皿" 字符串转为 ["八", "刀", "皿"] 的数组
        let partsArray = [];
        const rawParts = data.Parts || data.parts;
        if (rawParts && rawParts.trim()) {
          partsArray = rawParts.split(',').map(p => p.trim());
        }

        results.push({
          grade: data.Grade || data.grade,
          subject: '华文',
          topic: data.Topic || data.topic,
          character: data.Question || data.question,
          pinyin: data.Correct_Answer || data['Correct Answer'] || data.correct_answer,
          parts: partsArray // 标准 JSONB 格式入库
        });
      })
      .on('end', async () => {
        console.log(`[读取完成] 独立生字库共 ${results.length} 条生字，准备灌入...`);
        for (let i = 0; i < results.length; i += 50) {
          const chunk = results.slice(i, i + 50);
          const { error } = await supabase.from('dict_chinese_characters').upsert(chunk, { onConflict: 'character' });
          if (error) console.error(`[灌入失败] 生字分批 ${i} 错误:`, error.message);
        }
        console.log(`[🥳 灌入成功] 独立生字元数据库全量同步完毕。`);
        resolve();
      });
  });
}

async function startMigration() {
  console.log('🚀 开始全量数据搬家资产清洗计划...');
  // 1. 刷入大一统题库（确保文件名和你本地一致）
  await importQuestions('Practice Hub - English.csv', 'English');
  await importQuestions('Practice Hub - Math.csv', 'Math');
  await importQuestions('Practice Hub - Science.csv', 'Science');
  await importQuestions('Practice Hub - 华文.csv', '华文');
  
  // 2. 刷入独立生字库
  await importChineseDict('Practice Hub - 生字.csv');
  console.log('🏁 所有 CSV 资产大搬家圆满成功！');
}

startMigration();