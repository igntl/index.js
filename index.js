const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// إعدادات الغرف (استبدل الأرقام بـ IDs الخاصة بك)
const NOMINATION_CHANNEL_ID = 'ايدي_روم_الترشيحات'; 
const RESULT_CHANNEL_ID = 'ايدي_روم_النتيجة_واللستة'; 
const PREFIX = '!'; // أمر تشغيل البوت

// الكلمات المفتاحية لرسائل التهنئة والإعلان الإدارية
const EXCLUDE_KEYWORDS = ['ها هو', 'ها هو', 'مبروك', 'فاز', 'الفائز', 'تهنئة', 'المركز', 'كفو'];
const MAX_LETTER_LIMIT = 70; // طول الرسالة التي تعتبر إعلان أو تهنئة وليس ترشيح مجرد

client.once('ready', () => {
    console.log(`تم تشغيل البوت بنجاح باسم: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/+/);
    const command = args.shift().toLowerCase();

    if (command === 'sort') {
        if (!message.member.permissions.has('ManageMessages')) {
            return message.reply('عذراً، هذا الأمر مخصص للإدارة فقط.');
        }

        const nominationChannel = client.channels.cache.get(NOMINATION_CHANNEL_ID);
        const resultChannel = client.channels.cache.get(RESULT_CHANNEL_ID);

        if (!nominationChannel || !resultChannel) {
            return message.reply('خطأ: لم يتم العثور على الغرف المحددة في الكود.');
        }

        const statusMessage = await message.reply('⏳ جاري سحب السجل بالكامل (قد يستغرق بعض الوقت بسبب حجم البيانات الضخم)، يرجى الانتظار...');

        try {
            const nominationCounts = {};
            let lastMessageId = null;
            let totalFetched = 0;
            let fetchedMessages;
            
            // متغير للاحتفاظ بمعرف الإداري الذي أرسل رسالة تهنئة مؤخراً
            // لتخطي منشن الفائز الذي يرسله مباشرة بعدها
            let lastAdminWhoAnnounced = null; 

            // حلقة تكرارية مفتوحة تسحب كل الرسائل السابقة بدون حد أقصى لحين انتهاء الروم
            do {
                const options = { limit: 100 };
                if (lastMessageId) options.before = lastMessageId;

                fetchedMessages = await nominationChannel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                totalFetched += fetchedMessages.size;
                lastMessageId = fetchedMessages.last().id;

                // تحويل الرسائل الـ 100 الحالية لترتيب زمني (من الأقدم للأحدث) للتعامل مع التتابع بدقة
                const currentBatch = Array.from(fetchedMessages.values()).reverse();

                currentBatch.forEach(msg => {
                    if (msg.author.bot) return;

                    const contentText = msg.content.toLowerCase();
                    const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(keyword => contentText.includes(keyword));

                    // الفحص الذكي: إذا كانت الرسالة تهنئة (تبدأ بـ ها هو، مبروك، أو رسالة طويلة)
                    if (contentText.length > MAX_LETTER_LIMIT || hasExcludeKeyword) {
                        lastAdminWhoAnnounced = msg.author.id; // نسجل أن هذا الإداري أعلن عن فائز الآن
                        return; // نتخطى الرسالة نفسها ولا نحسب أي منشن بداخلها
                    }

                    // إذا أرسل نفس الإداري منشن مباشرة بعد رسالة التهنئة
                    if (lastAdminWhoAnnounced && msg.author.id === lastAdminWhoAnnounced && msg.mentions.users.size > 0) {
                        lastAdminWhoAnnounced = null; // قمنا بتصفية منشن الفائز بنجاح، نصفر المتغير للرسائل القادمة
                        return; // نتخطى هذا المنشن ولا نحسبه ترشيحاً
                    }

                    // إذا مرت رسالة من شخص آخر، نلغي حالة الترقب للإداري
                    if (lastAdminWhoAnnounced && msg.author.id !== lastAdminWhoAnnounced) {
                        lastAdminWhoAnnounced = null;
                    }

                    // احتساب الترشيحات الحقيقية المتبقية
                    const mentions = msg.mentions.users;
                    mentions.forEach(user => {
                        if (user.bot) return;
                        nominationCounts[user.id] = (nominationCounts[user.id] || 0) + 1;
                    });
                });

                // تحديث الرسالة كل 2000 رسالة لإعلام الإدارة بالتقدم الحالي دون حظر البوت من الديسكورد
                if (totalFetched % 2000 === 0) {
                    await statusMessage.edit(`⏳ جاري الفرز... تم فحص **${totalFetched}** رسالة حتى الآن.`);
                }

            } while (fetchedMessages.size === 100);

            // ترتيب النتيجة النهائية تنازلياً
            const sortedNominees = Object.entries(nominationCounts)
                .sort((a, b) => b[1] - a[1]);

            if (sortedNominees.length === 0) {
                return statusMessage.edit('❌ انتهى البحث ولم يتم العثور على أي ترشيحات صالحة بعد الفرز الذكي.');
            }

            // بناء القائمة الموحدة
            const embed = new EmbedBuilder()
                .setTitle('📊 اللستة النهائية لفرز وتصفية الترشيحات الموحدة')
                .setDescription(`تم مسح الروم بالكامل وفحص **${totalFetched}** رسالة سابقة بنجاح ونزع منشنات التهنئة الإدارية ("ها هُوَ" وغيرها).`)
                .setColor('#2efc03')
                .setTimestamp();

            let descriptionText = '';
            sortedNominees.forEach(([userId, count], index) => {
                descriptionText += `**#${index + 1}** | <@${userId}> ➔ **${count}** صوت\n`;
            });

            // لحماية الرسالة من الاختفاء بسبب حد الحروف في الديسكورد (4096 حرف للـ Embed)
            if (descriptionText.length > 4000) {
                descriptionText = descriptionText.substring(0, 3950) + '\n... وتستمر القائمة للأعضاء الباقين بنفس الترتيب.';
            }

            embed.addFields({ name: 'الترتيب التنازلي من الأكثر تصويتاً للأقل:', value: descriptionText });

            // إرسال اللستة النهائية في الروم الثاني وتحديث رسالة الأمر
            await resultChannel.send({ embeds: [embed] });
            await statusMessage.edit(`✅ اكتملت العملية بنجاح! تم فحص **${totalFetched}** رسالة وإرسال اللستة الموحدة في: <#${RESULT_CHANNEL_ID}>`);

        } catch (error) {
            console.error(error);
            await statusMessage.edit('❌ حدث خطأ أثناء المعالجة أو الفرز الشامل للرسائل.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
