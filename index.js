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
const NOMINATION_CHANNEL_ID = '1483164935436374096'; 
const RESULT_CHANNEL_ID = '1519325101479297176'; 
const PREFIX = '!'; // أمر تشغيل البوت

// الكلمات المفتاحية لرسائل التهنئة والإعلان الإدارية
const EXCLUDE_KEYWORDS = ['ها هو', 'ها هو', 'مبروك', 'فاز', 'الفائز', 'تهنئة', 'المركز', 'كفو'];
const MAX_LETTER_LIMIT = 70; // طول الرسالة التي تعتبر إعلان أو تهنئة وليس ترشيح مجرد

client.once('clientReady', () => {
    console.log(`تم تشغيل البوت بنجاح باسم: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    if (command === 'sort') {
        if (!message.member.permissions.has('ManageMessages')) {
            return; // تجاهل الأمر تماماً إذا لم يكن إدارياً دون إرسال رسائل
        }

        const nominationChannel = client.channels.cache.get(NOMINATION_CHANNEL_ID);
        const resultChannel = client.channels.cache.get(RESULT_CHANNEL_ID);

        if (!nominationChannel || !resultChannel) {
            console.error('خطأ: لم يتم العثور على الغرف المحددة في الكود.');
            return;
        }

        try {
            const nominationCounts = {};
            let lastMessageId = null;
            let totalFetched = 0;
            let fetchedMessages;
            
            let lastAdminWhoAnnounced = null; 

            // حلقة تكرارية صامتة بالكامل لسحب كل البيانات
            do {
                const options = { limit: 100 };
                if (lastMessageId) options.before = lastMessageId;

                fetchedMessages = await nominationChannel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                totalFetched += fetchedMessages.size;
                lastMessageId = fetchedMessages.last().id;

                const currentBatch = Array.from(fetchedMessages.values()).reverse();

                currentBatch.forEach(msg => {
                    if (msg.author.bot) return;

                    const contentText = msg.content.toLowerCase();
                    const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(keyword => contentText.includes(keyword));

                    if (contentText.length > MAX_LETTER_LIMIT || hasExcludeKeyword) {
                        lastAdminWhoAnnounced = msg.author.id; 
                        return; 
                    }

                    if (lastAdminWhoAnnounced && msg.author.id === lastAdminWhoAnnounced && msg.mentions.users.size > 0) {
                        lastAdminWhoAnnounced = null; 
                        return; 
                    }

                    if (lastAdminWhoAnnounced && msg.author.id !== lastAdminWhoAnnounced) {
                        lastAdminWhoAnnounced = null;
                    }

                    const mentions = msg.mentions.users;
                    mentions.forEach(user => {
                        if (user.bot) return;
                        nominationCounts[user.id] = (nominationCounts[user.id] || 0) + 1;
                    });
                });

                // تم حذف سطر إرسال وتعديل رسائل التحديث هنا لضمان عدم حدوث الكراش (Unknown Message)

            } while (fetchedMessages.size === 100);

            const sortedNominees = Object.entries(nominationCounts)
                .sort((a, b) => b[1] - a[1]);

            if (sortedNominees.length === 0) {
                return resultChannel.send('❌ انتهى الفرز الصامت ولم يتم العثور على أي ترشيحات صالحة.');
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

            if (descriptionText.length > 4000) {
                descriptionText = descriptionText.substring(0, 3950) + '\n... وتستمر القائمة للأعضاء الباقين بنفس الترتيب.';
            }

            embed.addFields({ name: 'الترتيب التنازلي من الأكثر تصويتاً للأقل:', value: descriptionText });

            // إرسال النتيجة فوراً ومباشرة في الروم الثاني
            await resultChannel.send({ embeds: [embed] });

        } catch (error) {
            console.error('حدث خطأ أثناء معالجة الرسائل:', error);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
