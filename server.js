const express =  require('express');   // express 모듈 가져오기
const app = express();                 // express 모듈 가져와서 app 인스턴스 생성
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { log } = require('console');
const multer = require('multer');
const path = require('path');
const { v4 } = require('uuid');
const { send } = require('process');
const sharedSession = require('socket.io-express-session');
const twilio = require('twilio');
const twilioClient = twilio('AC834c163f7736ce902b18d8956fa58025', '684a7bd672b415cc00f7a7994407e258');
const verificationCodes = {};

// db 객체에 데이터베이스 슈퍼베이스 username, host, database, password 지정 후 대입
const db = new Pool({
    user: 'postgres.vpcdvbdktvvzrvjfyyzm',
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    database: 'postgres',
    password: 'Odvv8E1iChKjwai4',
    port: 6543,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});

//테스트 커밋용, 업로드 파일 디스크에 저장할 수 있도록 함. 
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, 'uploads/');           // 파일 'uploads/' 디렉토리 쪽에 저장
    },
    filename: function(req, file, cb) {
        cb(null, Date.now()+path.extname(file.originalname));
    }
});

// upload 객체 multer로 만들기 
const upload = multer({ storage: storage });
const _session = session({          // 세션 제작
    resave: true,
    saveUninitialized: false,
    secret: 'secret'
});

app.use(cookieParser());
app.use(_session);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
io.use(sharedSession(_session, {autoSave: true}));

app.set('view engine', 'ejs');

const port = 8000;

server.listen(port, function() {
    log('Server host in http://localhost:' + port);   // http://localhost + 위에 설정한 port(8000) 연결 후 메세지
});

// 정적 파일들 html, css 연결 도구
app.use('/js', express.static(__dirname + '/js'));
app.use('/css', express.static(__dirname + '/css'));
app.use('/uploads', express.static(__dirname + '/uploads'));
app.use('/processed', express.static(__dirname + '/processed'));
app.use("/main_css", express.static(__dirname + '/main_css'));
app.use("/image", express.static(__dirname + '/image'));

////////////////////////////////////////////////////////////////
// 정적 페이지 연결하기 문단

app.get('/find_password', function(req, res){
    res.render('find_password.ejs');  // 비밀번호 찾기 페이지 제공
})

app.get('/find_passwordauth', function(req, res) {
    res.render('find_passwordauth.ejs');  // 비밀번호 찾기 성공 페이지 제공
});

app.get('/find_password_success', function(req, res) {
    const { password } = req.session;
    if (password) {
        delete req.session.password;
        res.render('find_password_success.ejs', { password: password });
        return;
    }
    res.redirect('/');  // 비밀번호 찾기 성공 페이지 제공
});

app.get('/register', function(req, res){
    res.render('register.ejs');  // 회원가입 페이지 제공
})

// 정적 페이지 연결하기 문단
//////////////////////////////////////////////////////////////////////



///////////////////////////////////////////////////////////////////////
// 라우팅 설정 부분(ejs 확장자 파일 라우팅 추가할 경우 여기 문단쪽에 넣으시면 됩니다.)

app.get('/login', function(req, res) {
    const { user } = req.session;
    if (user) {
        res.redirect('/');
        return;
    }
    res.render('login.ejs'); // Serve login.html
});

app.get('/calendar', function(req, res) {
    res.render('calendar.ejs');
});

app.get('/documentsummary', function(req, res) {
    res.render('document-summary.ejs');
});

app.get('/register_confirm', function(req, res){
    const { name } = req.session;
    if (name) {
        delete req.session.name;
        res.render('register_confirm.ejs', name );  // register ejs
    } else {
        res.send('error');
    }
});

app.get('/uploads/:file', (req, res) => {
    const {file} = req.params;
    res.sendFile(__dirname+`/uploads/${file}`);
});

app.get('/filefolder', (req, res) => {
    res.render('filefolder');
})

// 라우팅 설정 부분(ejs 확장자 라우팅 추가할 경우 여기 문단쪽에 넣으시면 됩니다.)
/////////////////////////////////////////////////////////////////////////////////



/////////////////////////////////////////////////////////////////////////////////
// 로그인, 회원가입, 비밀번호 찾기 페이지의 엔드포인트 설정 부분

//로그인시 아이디랑 비밀번호 확인 후 로그인 동작
app.post('/login', async (req, res) => {
    const { id, password } = req.body;
    const data = await db.query(
        "select * from users where user_id=$1 and user_pw=$2",
        [ id, password ]
    );
    if (data.rows.length === 1) {
        const user_id = data.rows[0].user_id;
        const user_name = data.rows[0].user_name;
        req.session.user = { user_id, user_name };
        res.redirect('/');
    } else {
        res.redirect('#');
    }
});

//회원 가입시 정보 db에 저장
app.post('/register', function(req, res) {
    const { id, name, phone, password } = req.body;
    req.session.name = { name };
    db.query(
        "insert into users values ($1, $2, $3, '-', '-', $4)",
        [id, password, name, phone]
    )
    res.redirect('/register_confirm');
});


// 비밀번호 찾기 엔드포인트
app.post('/find_password', async (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        // user_id에 해당하는 사용자를 찾는 쿼리
        const result = await db.query('SELECT user_name FROM users WHERE user_id = $1', [user_id]);

        if (result.rows.length > 0) {
            // 성공적인 응답과 리디렉션 URL 반환
            req.session.user_id = user_id;
            res.json({ 
                message: 'Password reset link has been sent.',
                redirectTo: 'find_passwordauth' 
            });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error occurred:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


//핸드폰 인증코드 호출
app.post('/send-verification-code', (req, res) => {
    const { phone } = req.body;
    const verificationCode = Math.floor(100000 + Math.random() * 900000); // 6자리 코드 생성

    twilioClient.messages
        .create({
            body: `Your verification code is ${verificationCode}`,
            from: '+16194323674',
            to: phone
        })
        .then((message) => {
            verificationCodes[phone] = verificationCode;
            res.send({ success: true });
        })
        .catch((error) => {
            console.error(error);
            res.send({ success: false, error: 'Failed to send verification code' });
        });
});

//인증코드 인증
app.post('/verify-code', (req, res) => {
    const { phone, code } = req.body;
    if (verificationCodes[phone] && verificationCodes[phone] === parseInt(code)) {     // 여기서부터 인증 있게 하려면 주석해제할것
        req.session.isVerified = true; // 세션에 인증 정보 저장
        delete verificationCodes[phone]; // 인증 코드 삭제
        res.send({success: true});
    } else {
        res.send({ success: false, error: 'Invalid verification code' });
    }
    // req.session.isVerified = true;    // 인증 없이 하려면 이거 주석해제
    // res.send({success: true});        // 인증 없이 하려면 이거 주석해제
});

// 인증이 완료된 후 클라이언트에 리디렉션 URL을 제공하는 엔드포인트
app.post('/find_passwordauth', async (req, res) => {
    if (req.session.isVerified) {
        const { user_id } = req.session;

        // if (!user_id) {
        //     console.error('User ID is missing');
        //     return res.status(400).json({ error: 'User ID is required' });
        // }

        try {
            console.log('Querying database for user ID:', user_id);
            const result = await db.query('SELECT user_pw FROM users WHERE user_id = $1', [user_id]);
            
            if (result.rows.length > 0) {
                const password = result.rows[0].user_pw;
                console.log("Retrieved password:", password);  // 로그로 확인
                
                // res.render('find_password_success', { password: password });
                
                req.session.password = password;
                
                // res.redirect('/find_password_success');
                res.json({ redirectTo: '/find_password_success' });
            } else {
                console.error('User not found for ID:', user_id);
                res.status(404).json({ error: 'User not found' });
            }
        } catch (error) {
            console.error('Error occurred during DB query or rendering:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    } else {
        res.status(400).json({ error: 'Authentication not completed' });
    }
});

// 위에서 패스워드 확인 성공시 엔드포인트(비밀번호 db 검색 후)
app.post('/find_password_success', async (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        console.error('User ID is missing');
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        console.log('Querying database for user ID:', user_id);
        const result = await db.query('SELECT user_pw FROM users WHERE user_id = $1', [user_id]);

        if (result.rows.length > 0) {
            const password = result.rows[0].user_pw;
            console.log("Retrieved password:", password);  // 로그로 확인

            res.render('find_password_success', { password: password });
        } else {
            console.error('User not found for ID:', user_id);
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error occurred during DB query or rendering:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


//////////////////////////////////////////////////////////////////////////////
// 메인 영역 페이지 엔드포인트 부분. 해당하는 건 여기에 넣어주시면 됩니다.

app.get('/', async (req, res) => {
    const { user } = req.session;
    if (!user) {
        res.redirect('/login');
        return;
    }
    const userList = await db.query(
        "select user_id, user_name from users where user_id != $1",
        [ user.user_id ]
    )
    const chatroomList = await db.query(
        "select * from rooms where id in (select room_id from room_users where user_id = $1)",
        [ user.user_id ]
    )
    res.render('main_iframe', {
        user: user, 
        members: userList.rows, 
        chatroomList: chatroomList.rows 
    });
});


// 캘린더 부분
app.post('/calendar/share', async (req, res) => {
    const { user } = req.session;
    if (!user) {
        res.status(404).json({ message: 'need to login' });
    }
    const { calendarId, roomId } = req.body;
    const users = await db.query(
        'select user_id from room_users where room_id=$1',
        [roomId]
    );
    try {
        users.rows.forEach((u) => {
            if (u.user_id != user.user_id) {
                console.log(u.user_id);
                db.query(
                    'insert into calendar_shared (calendar_id, user_id) values ($1, $2)',
                    [calendarId, u.user_id]
                );
            }
        });
        db.query(
            "update calandars set calendar_id = 'cal2' where id = $1",
            [calendarId]
        );
        res.status(200).json({ message: 'success' });
    }catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to save event to the database' });
    }
});

// 채팅방 부분
app.get('/chatroomframe', async (req, res) => {
    const { user } = req.session;
    if (!user) {
        res.redirect('/login');
        return;
    }
    const chatroomList = await db.query(
        `
        select r.*, c.chat, c.type
        from rooms r join 
        (select * 
         from chat_logs 
         where chat_at in 
         (select max(chat_at) 
          from chat_logs 
          group by room_id)) c 
        on r.id = c.room_id 
        where r.id in 
        (select room_id
         from room_users
         where user_id = $1)
        order by c.chat_at desc
        `,
        [ user.user_id ]
    )
    
    res.render('chatroom', {
        user: user, 
        chatroomList: chatroomList.rows 
    });
});

app.get('/newchatroom', async (req, res) => {
    const { user } = req.session;
    if (!user) {
        res.redirect('/login');
        return;
    }
    const userList = await db.query(
        "select user_id, user_name from users where user_id != $1",
        [ user.user_id ]
    );
    res.render('newchatroom', {
        user: user, 
        userList: userList.rows
    });
});

//채팅페이지
app.get('/chat/:id', async function(req, res) {
    const { user } = req.session;
    const room_id = req.params.id;
    if (!user) {
        res.redirect('/');
    }
    const user_check = await db.query(
        "select id from room_users where room_id=$1 and user_id=$2",
        [ room_id, user.user_id ]
    )
    if (!user_check) {
        res.redirect('/');
    }
    const room = await db.query(
        "select * from rooms where id=$1",
        [ room_id ]
    )
    const chat_log = await db.query(
        "select cl.user_id, user_name, chat, type from chat_logs cl join users us on cl.user_id = us.user_id where room_id=$1 order by cl.chat_at",
        [ room_id ]
    );
    const member = await db.query(
        "select u.user_name from room_users ru join users u on ru.user_id = u.user_id where ru.room_id=$1",
        [ room_id ]
    )
    res.render('chat.ejs', {room: room.rows[0], chat_log: chat_log.rows, member: member.rows, user: user});
});

//소켓 통신 (채팅 부분)
io.on('connection', (socket) => {
    socket.on('join', (roomId) => {
        socket.join(roomId);
    })

    socket.on('msg', (msg) => {
        console.log(msg);
        const { user } = socket.handshake.session;
        console.log(user);

        db.query(
            "insert into chat_logs (id, user_id, room_id, chat, type) values (nextval('seq_chat_id'), $1, $2, $3, $4)",
            [user.user_id, msg.room, msg.message, msg.type]
        );

        io.to(msg.room).emit('msg', {...msg, user_id: user.user_id, user_name: user.user_name});
    });
});

app.post('/newroom', async (req, res) => {
    const { user } = req.session;
    if ( !user ) {
        res.send({
            result: false,
        });
        return;
    }
    const { inviteList, roomName } = req.body;
    inviteList.push(user.user_name);
    const room_id = v4();
    const is_group = (inviteList.length != 2);
    console.log(inviteList);
    // console.log(roomName == '');
    if (roomName == '') {
        res.send({
            result: false,
        });
        return;
    }

    db.query(
        'insert into rooms (id, room_name, is_group) values ($1, $2, $3)',
        [room_id, roomName, is_group]
    );
    
    inviteList.forEach((id) => {
        db.query(
            'insert into room_users (room_id, user_id) values ($1, (select user_id from users where user_name=$2))',
            [room_id, id]
        );
    });
    res.send({result: true});
});

// 메모 페이지 라우팅
app.get('/memo', (req, res) => {
    res.render('memo'); // 'memo.ejs'를 'views' 폴더에 위치시켜야 합니다.
});

app.get('/documentsummary', (req, res) => {
    res.render('document-summary');
})

// app.get('/db', async function(req, res) {
//     const data = await db.query("select * from chat_logs where room_id='0'");
//     res.send(data.rows);
// });

app.post('/upload', upload.single('file'), function(req, res) {
    const file = req.file;
    res.send(
        {
            result: 'ok',
            path: file.path
        }
    );
});

// 파일 다운로드 관련 엔드포인트
const { exec } = require('child_process');
const fs = require('fs');

// 업로드된 파일 처리
// 플라스크에 합쳐져서 이거 이제 없어도 됨.

// app.post('/upload_summary', upload.single('file'), (req, res) => {
//     const file = req.file;
//     if (!file) {
//         return res.status(400).send({ error: '파일 업로드 실패' });
//     }

//     console.log('Uploaded file path:', file.path);

//     // 처리된 파일을 저장할 디렉토리 확인 및 생성
//     if (!fs.existsSync('processed')) {
//         fs.mkdirSync('processed');
//     }

//     // Python 스크립트 실행
//     exec(`python ollama.py ${file.path}`, (error, stdout, stderr) => {
//         if (error) {
//             console.error(`exec error: ${error}`);
//             return res.status(500).send({ error: '파일 처리 실패' });
//         }

//         // 처리된 파일 저장
//         const processedFilePath = `processed/test_processed.docx`; // 처리된 파일 경로
//         // const processedFilePath = `processed/.docx`; // 처리된 파일 경로
//         // fs.writeFileSync(processedFilePath, stdout);

//         // 클라이언트에게 처리 결과와 다운로드 링크 제공
//         res.send({
//             result: 'ok',
//             originalFilePath: file.path,
//             processedFilePath: `${path.basename(processedFilePath)}`,    // 다운로드 링크 제공
//             output: stdout,
//             error: stderr
//         });
//     });
// });

// // 처리된 파일 다운로드
// app.get('/download/:filename', (req, res) => {
//     const filename = req.params.filename;
//     const filePath = path.join(__dirname, 'processed', filename);

//     // 파일이 존재하는지 확인
//     if (!fs.existsSync(filePath)) {
//         return res.status(404).send('파일을 찾을 수 없습니다.');
//     }

//     res.download(filePath, filename, (err) => {
//         if (err) {
//             console.error(`Error downloading file: ${err}`);
//             res.status(500).send('파일 다운로드 실패');
//         }
//     });
// });

//결재 요청 보내기
app.post('/payment_req', async (req, res) => {
    const { user } = req.session;
    if (!user) {
        res.send('invalid reqeust');
        return;
    }
    const path = req.body.path;
    const id = v4();
    await db.query(
        "insert into payment (id, uploader, path) values ($1, $2, $3)",
        [ id, user.user_id, path ]
    );
    
    res.send( {uuid: id} );
});

//결재 요청 응답
app.post('/payment_res', upload.single('file'), async (req, res) => {
    const { user } = req.session;

    if (!user) {
        res.send('invalid request');
        return;
    }
    const file = req.file;

    const data = await db.query(
        "select app from payment where id=$1",
        [ id ]
    );
    if (data.rows[0].app) {
        res.send(
            {result: false}
        );
    }

    await db.query(
        "update payment set app_at=now(), app=$1, app_path=$2 where id=$3",
        [ user.user_id, file.path, req.body.uuid ]
    );

    res.send(
        { result: 'ok' }
    );
});

//결재 요청 url
app.get('/payment/:uuid', async (req, res) => {
    const { user } = req.session;
    if (!user) {
        res.send('invalid reqeust');
        return;
    }
    const id = req.params.uuid;
    const data = await db.query(
        "select * from payment where id=$1",
        [ id ]
    );
    let applied = false;
    if (data.rows[0].app) {
        applied = true;
    }
    res.render('payment.ejs', { uuid: id, applied: applied })
});

//결재 요청 url의 파일 다운로드 링크
app.get('/payment_file/:uuid', async (req, res) => {
    const id = req.params.uuid;
    const data = await db.query(
        "select * from payment where id=$1",
        [ id ]
    );
    if (data.rows[0].app) {
        res.download(data.rows[0].app_path);
    } else {
        res.download(data.rows[0].path);
    }
});

function dateParser(str) {
    function leftpad (str, len, ch) {
        str = String(str);
        var i = -1;
        if (!ch && ch !== 0) ch = '';
        len = len - str.length;
        while (++i < len) {
            str = ch + str;
        }
        return str;
    }

    let date = new Date(str.toString());
    let res_ = '';

    res_ += leftpad(date.getFullYear(), 4, 0) +'-';
    res_ += leftpad(date.getMonth()+1, 2, 0) +'-';
    res_ += leftpad(date.getDate(), 2, 0) +'T';
    res_ += leftpad(date.getHours(), 2, 0) +':';
    res_ += leftpad(date.getMinutes(), 2, 0) +":";
    res_ += leftpad(date.getSeconds(), 2, 0);

    return res_;
}

/////////////////////////////////////////////////////////////////////////////////////
// 캘린더 db 관련 데이터베이스 처리 부분 

// 이벤트 데이터를 처리하는 API 엔드포인트
app.post('/api/events', async (req, res) => {
    console.log(req.body);
    // const { id, title, category, start, end, state, location, isReadOnly } = req.body;
    const { end, id, isAllday, isPrivate, location, start, state, title, calendarId } = req.body;
    
    try {
        // PostgreSQL에 이벤트 데이터를 저장
        await db.query(
            'INSERT INTO calandars(id, user_id, start_date, end_date, title, location, isallday, state, calendar_id) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [id, 'user_id', dateParser(start.d.d), dateParser(end.d.d), title, location, isAllday, state, calendarId ]
            
        );

        res.status(201).json({ message: 'Event successfully saved to the database' });
    } catch (error) {
        console.error('Error saving event to the database:', error);
        res.status(500).json({ message: 'Failed to save event to the database' });
    }
});

// 데이터 삭제 엔드포인트 추가
app.delete('/api/events/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query('DELETE FROM calandars WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount > 0) {
            res.status(200).json({ message: 'Event deleted successfully', deletedEvent: result.rows[0] });
        } else {
            res.status(404).json({ message: 'Event not found' });
        }
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ message: 'Failed to delete event from the database' });
    }
});

// 데이터 수정 엔드포인트 추가
app.put('/api/events/:id', async (req, res) => {
    const { id } = req.params;
    const { title, start, end, location, isAllday, state } = req.body;

    try {
        const result = await db.query(
            `UPDATE calandars
             SET title = $1, start_date = $2, end_date = $3, location = $4, isallday = $5, state = $6
             WHERE id = $7
             RETURNING *`,
            [title, dateParser(start.d.d), dateParser(end.d.d), location, isAllday, state, id]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ message: 'Event not found' });
        } else {
            res.status(200).json(result.rows[0]);
        }
    } catch (error) {
        console.error('Error updating event in the database:', error);
        res.status(500).json({ message: 'Failed to update event in the database' });
    }
});


// 특정 사용자의 이벤트 가져오기 API
app.get('/api/events/:user_id', async (req, res) => {
    const { user_id } = req.params;

    try {
        const resultSelf = await db.query(
            'SELECT c.*, u.user_name FROM calandars c join users u on c.user_id=u.user_id WHERE c.user_id = $1',
            [user_id]
        );
        const resultShare = await db.query(
            'select c.*, u.user_name from calandars c join users u on c.user_id=u.user_id where c.id in (select calendar_id from calendar_shared where user_id=$1)',
            [user_id]
        )
        // console.log(result.rows);
        res.status(200).json({ 
            myCalendar: resultSelf.rows,
            shareCalendar: resultShare.rows
        });
    } catch (error) {
        console.error('Error fetching events from the database:', error);
        res.status(500).json({ message: 'Failed to fetch events from the database' });
    }
});

app.get('/session/user_id', (req, res) => {
    const { user } = req.session;
    if (!user) {
        res.send('');
        return;
    }
    res.send(user.user_id);
});

app.get('/session/user_name', (req, res) => {
    const { user } = req.session;
    if (!user) {
        res.send('');
        return;
    }
    res.send(user.user_name);
});