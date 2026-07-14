const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, MessageFlags } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent 
    ]
});

// إعدادات الغرف الخاصة بك
const NOMINATION_CHANNEL_ID = '1483164935436374096'; 
const RESULT_CHANNEL_ID = '1519325101479297176';     

// الكلمات المفتاحية لرسائل التهنئة والإعلان الإدارية
const EXCLUDE_KEYWORDS = ['ها هو', 'مبروك', 'فاز', 'الفائز', 'تهنئة'];
const MAX_LETTER_LIMIT = 70; 

client.once('clientReady', async () => {
    console.log(`🚀 تم تشغيل البوت بنجاح ومستعد للفرز التاريخي الكامل: ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('sort')
            .setDescription('سحب كافة الترشيحات التاريخية منذ إنشاء الروم بدقة 100%')
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('تم تسجيل أمر السلاش بنجاح!');
    } catch (error) {
        console.error('خطأ في تسجيل الأمر:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'sort') {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: 'عذراً، هذا الأمر مخصص للإدارة فقط.', flags: [MessageFlags.Ephemeral] });
        }

        const nominationChannel = client.channels.cache.get(NOMINATION_CHANNEL_ID);
        const resultChannel = client.channels.cache.get(RESULT_CHANNEL_ID);

        if (!nominationChannel || !resultChannel) {
            return interaction.reply({ content: 'خطأ: لم يتم العثور على الغرف المحددة.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.reply({ content: '⚡ بدأ الغوص بالأرشيف وسحب كل الرسائل التاريخية حرفاً بحرف، ثوانٍ وستجد النتائج جاهزة...', flags: [MessageFlags.Ephemeral] });

        try {
            const nominationCounts = {};
            let allMessages = [];
            let lastMessageId = null;
            let fetchedMessages;

            // 1. الحلقة البرمجية المصححة لجلب الأرشيف التنازلي الحقيقي
            do {
                const options = { limit: 100 };
                if (lastMessageId) options.before = lastMessageId;

                fetchedMessages = await nominationChannel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                // نقوم بإضافة الرسائل المجلوبة للمصفوفة مباشرة
                const batch = Array.from(fetchedMessages.values());
                allMessages.push(...batch);
                
                // هنا المفتاح: نأخذ الآيدي الخاص بآخر رسالة حقيقية تم جلبها في الدفعة الحالية لتنزيل المؤشر لأسفل
                lastMessageId = batch[batch.length - 1].id;

                // تأخير بسيط لمنع حجب ديسكورد (Rate limit)
                await new Promise(resolve => setTimeout(resolve, 60));

            } while (fetchedMessages.size === 100);

            // 2. ترتيب الرسائل المجلوبة من الأقدم إلى الأحدث زمنياً ليبدأ الفرز بالترتيب الصحيح
            allMessages.reverse();

            let lastCongratAuthorId = null;
            let lastCongratTime = 0;

            // 3. تحليل الفرز بدقة لامتناهية
            for (const msg of allMessages) {
                if (msg.author.bot) continue; // استبعاد البوتات

                const contentText = msg.content.toLowerCase().trim();
                const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(k => contentText.includes(k));
                const isCongratMessage = contentText.length > MAX_LETTER_LIMIT || hasExcludeKeyword;

                // أ) استبعاد وتتبع رسائل التهنئة
                if (isCongratMessage) {
                    lastCongratAuthorId = msg.author.id;
                    lastCongratTime = msg.createdTimestamp;
                    continue; 
                }

                // ب) سحب كافة المنشنات بالـ Regex من النص لضمان التقاطها بأي موضع بالرسالة
                const mentionMatches = [...msg.content.matchAll(/<@!?(\d+)>/g)];
                if (mentionMatches.length === 0) continue;

                // إزالة التكرار من الرسالة الواحدة (لو منشن نفس العضو مرتين تُحسب له صوت واحد)
                let userIdsInMessage = [...new Set(mentionMatches.map(match => match[1]))];

                // ج) استبعاد أول منشن (الفائز) إذا أرسله الإداري مباشرة بعد التهنئة (أقل من دقيقة)
                const timeDifference = msg.createdTimestamp - lastCongratTime;
                if (lastCongratAuthorId && msg.author.id === lastCongratAuthorId && timeDifference < 60000) {
                    if (userIdsInMessage.length === 1) {
                        // لو رسالة الإداري فيها منشن الفائز فقط، نستبعدها كلها
                        lastCongratAuthorId = null; 
                        continue; 
                    } else if (userIdsInMessage.length > 1) {
                        // لو رسالة الإداري فيها منشن الفائز ومعه مرشحين آخرين، نحذف الفائز ونحتفظ بالمرشحين
                        userIdsInMessage.shift();
                        lastCongratAuthorId = null;
                    }
                }

                // د) تسجيل الأصوات الصالحة لجميع الأعضاء داخل الرسالة
                userIdsInMessage.forEach(userId => {
                    nominationCounts[userId] = (nominationCounts[userId] || 0) + 1;
                });
            }

            // ترتيب النتيجة تنازلياً من الأكثر أصواتاً للأقل
            const sortedNominees = Object.entries(nominationCounts)
                .sort((a, b) => b[1] - a[1]);

            if (sortedNominees.length === 0) {
                return resultChannel.send('❌ انتهى الفرز التام ولم يتم العثور على أي ترشيحات صالحة بالروم.');
            }

            // 4. طباعة اللستة النهائية بنصوص طبيعية منسقة
            let currentMessageText = `📋 **اللستة الشاملة للترشيحات الموحدة (تم فحص كامل أرشيف الروم بعدد ${allMessages.length} رسالة بدقة 100%):**\n\n`;

            for (let index = 0; index < sortedNominees.length; index++) {
                const [userId, count] = sortedNominees[index];
                const line = `**#${index + 1}** | <@${userId}> ➔ **${count}** صوت\n`;

                if ((currentMessageText + line).length > 1800) {
                    await resultChannel.send({ content: currentMessageText });
                    currentMessageText = line; 
                } else {
                    currentMessageText += line;
                }
            }

            if (currentMessageText.length > 0) {
                await resultChannel.send({ content: currentMessageText });
            }

        } catch (error) {
            console.error('حدث خطأ أثناء الفرز التاريخي للروم:', error);
        }
    }
});

client.on('error', console.error);

client.login(process.env.DISCORD_TOKEN);
