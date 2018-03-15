// 厳格モード
'use strict';
// 'debug'モジュール呼び出し
const debug = require('debug');
// デバッガーを作成する
const scheduleJs_debugger = debug('debug:schedule.js');
scheduleJs_debugger('schedule.js処理開始');

// 'node-uuid'モジュール読み込み
// UUIDを生成するために必要
const uuid = require('node-uuid');
// Scheduleモデルを読み込む
const Schedule = require('../models/schedule');
// Candidateモデルを読み込む
const Candidate = require('../models/candidate');
// Userモデルを読み込む
const User = require('../models/user');
// Availabilityモデル読み込み
const Availability = require('../models/availability');

// ルーター作成
const express = require('express');
const router = express.Router();

// 認証確認用の自作モジュール読み込み
const authenticationEnsurer = require('./authentication-ensurer');

// GETで/schedules/newにアクセスされた時の処理
router.get('/new', authenticationEnsurer, (req, res, next) => {
  scheduleJs_debugger('GET(schedule/new)処理開始')
  res.render('new', { user: req.user });
  scheduleJs_debugger('GET(schedule/new)処理完了')
});

// POSTでschedules/newからデータを渡された時の処理
router.post('/', authenticationEnsurer, (req, res, next) => {
  // console.dir(req);
  scheduleJs_debugger('POST処理開始')
  // 予定(Schedule)のIDとしてUUIDを生成
  const scheduleId = uuid.v4();
  // 更新日時として現在時刻を設定
  const updatedAt = new Date();
  // Scheduleを生成して
  Schedule.create({
    scheduleId: scheduleId,
    // scheduleNameは255文字までとする
    scheduleName: req.body.scheduleName.slice(0, 255),
    memo: req.body.memo,
    // いつの間にかreq.userにGitHubの情報がわたっている
    createdBy: req.user.id,
    updatedAt: updatedAt
    // Scheduleが生成できれば
  }).then((schedule) => {
    // 候補日のテキストボックスに入力されたデータを
    // trim()して
    // 改行コードでsplit()して配列にして
    // 配列の中身もtrim()した配列を返す？
    const candidateNames = req.body.candidates
      .trim()
      .split('\r\n')
      .map((s) => s.trim());
    // その配列を１つずつCandidateModelっぽいものに変換して
    // CandidateModelっぽいものの配列を作る
    const candidates = candidateNames.map((c) => {
      return {
        candidateName: c,
        scheduleId: schedule.scheduleId
      };
    });
    // 作った配列をまとめてDBに登録して、
    Candidate.bulkCreate(candidates).then(() => {
      // うまくいったら/schedules/{scheduleId}にリダイレクトする
      // 初心者がわかるかこんなもん
      res.redirect('/schedules/' + schedule.scheduleId);
    });
  });
  scheduleJs_debugger('POST処理完了')
});

// schedules/{scheduleId}にGETでアクセスされた時の処理
router.get('/:scheduleId', authenticationEnsurer, (req, res, next) => {
  scheduleJs_debugger('GET(schedule/{scheduleId})処理開始')

  // 発行されるSQL
  // SELECT 
  //   "schedules"."scheduleId",
  //   "schedules"."scheduleName",
  //   "schedules"."memo",
  //   "schedules"."createdBy",
  //   "schedules"."updatedAt",
  //   "user"."userId" AS "user.userId",
  //   "user"."username" AS "user.username"
  // FROM 
  //   "schedules" AS "schedules"
  // LEFT OUTER JOIN
  //   "users" AS "user"
  // ON
  //   "schedules"."createdBy" = "user"."userId"
  // WHERE
  //   "schedules"."scheduleId" = '301316ee-67b1-4f2d-8b56-0e3fc6c815a9'
  // ORDER BY
  //   "updatedAt" DESC;
  Schedule.findOne({
    // Userテーブルと結合しているのだろう
    // DB作成時に従属関係を設定しているので
    // モデル名を指定するだけでいい感じに結合してくれるのだと思う
    // 初めて出てきた文法はちゃんと説明しろぼけ
    include: [
      {
        model: User,
        attributes: ['userId', 'username']
      }],
    // WHERE条件
    where: {
      scheduleId: req.params.scheduleId
    },
    order: '"updatedAt" DESC'
  }).then((schedule) => {
    // scheduleが取得できれば
    if (schedule) {
      // 対象スケジュールの候補日をすべて取得する
      Candidate.findAll({
        where: { scheduleId: schedule.scheduleId },
        order: '"candidateId" ASC'
      }).then((candidates) => {
        // 対象スケジュールに対応するすべての候補日に対応する全ての出欠を取得
        Availability.findAll({
          // Userテーブルと結合してuserId,usernameを取得
          include: [
            {
              model: User,
              attributes: ['userId', 'username']
            }
          ],
          // WHERE条件の指定
          where: { scheduleId: schedule.scheduleId },
          // ORDER順の指定
          order: '"user.username" ASC, "candidateId" ASC'
        }).then((availabilities) => {
          // 出欠 MapMap(キー:ユーザー ID, 値:出欠Map(キー:候補 ID, 値:出欠)) を作成する
          const availabilityMapMap = new Map(); // key: userId, value: Map(key: candidateId, availability)
          // 対象スケジュールの全ての出欠データを走査してMapを作成する
          availabilities.forEach((a) => {
            // ユーザーごとの出欠Mapを取得する
            // ない場合は新しく作る
            const map = availabilityMapMap.get(a.user.userId) || new Map();
            // ユーザーごとの出欠Mapにデータを設定する
            map.set(a.candidateId, a.availability);
            // ユーザーごとの出欠Mapを
            // 全ユーザーのMapMapにセットする
            availabilityMapMap.set(a.user.userId, map);
          });
          // AvailabilityMapMapはこんな感じ
          // { 16929852 => Map { 44 => 0, 45 => 0, 46 => 0, 47 => 0 } },
          // { 11111111 => Map { 44 => 0, 45 => 0, 46 => 0, 47 => 0 } },
          // { 22222222 => Map { 44 => 0, 45 => 0, 46 => 0, 47 => 0 } }

          // 閲覧ユーザーと出欠に紐づくユーザーからユーザー Map (キー:ユーザー ID, 値:ユーザー) を作る
          const userMap = new Map(); // key: userId, value: User
          // 閲覧中のユーザーをユーザーMapに登録する
          userMap.set(parseInt(req.user.id), {
            // 自分自身であることを示す
            isSelf: true,
            userId: parseInt(req.user.id),
            username: req.user.username
          });
          // 閲覧中スケジュールに対応するすべての出欠データを走査して、
          // 関連ユーザーをMapに追加する
          // この時点でユーザーMapにはスケジュールに関連しているユーザーと
          // 閲覧中ユーザーのデータが入っている
          // 閲覧中ユーザーが閲覧中スケジュールと関連しない場合もある
          availabilities.forEach((a) => {
            userMap.set(a.user.userId, {
              isSelf: parseInt(req.user.id) === a.user.userId, // 閲覧ユーザー自身であるかを含める
              userId: a.user.userId,
              username: a.user.username
            });
          });
          console.dir(userMap);
          // userMapはこんな感じ
          // { 16929852 => { isSelf: true, userId: 16929852, username: 'gladiolusbamboo' } }
          // { 11111111 => { isSelf: false, userId: 11111111, username: 'valtan-seijin' } }
          // { 22222222 => { isSelf: false, userId: 22222222, username: 'kane-gon' } }

          // 全ユーザー、全候補で二重ループしてそれぞれの出欠の値がない場合には、「欠席」を設定する
          // ユーザーMapからユーザーデータの部分だけを配列にして取り出す
          const users = Array.from(userMap)
            .map((keyValue) => keyValue[1]);
          console.dir(users);
          // usersはこんな感じ
          // [ { isSelf: true, userId: 16929852, username: 'gladiolusbamboo' },
          //   { isSelf: false, userId: 11111111, username: 'valtan-seijin' },
          //   { isSelf: false, userId: 22222222, username: 'kane-gon' } ]
          // 関連の全ユーザーを走査する
          users.forEach((u) => {
            // candidatesは「対象スケジュールに対応するすべての候補日」
            candidates.forEach((c) => {
              // 走査中ユーザーの出欠Mapを取得する。　存在しない場合は新規作成。
              const map = availabilityMapMap.get(u.userId) || new Map();
              // 走査中ユーザーの走査中の候補日に対する出欠データを取得する
              // 存在しない場合は0
              const a = map.get(c.candidateId) || 0; // デフォルト値は 0 を利用
              // 走査中ユーザーの出欠Mapに値を設定する
              map.set(c.candidateId, a);
              // 全ユーザーの出欠データを格納している
              // availabilityMapMapにデータを登録する（登録し直すイメージ？）
              availabilityMapMap.set(u.userId, map);
            });
          });

          console.log(availabilityMapMap); // TODO 除去する

          // 取得したデータを元にscheduleテンプレートを
          // 適用してhtmlを表示する
          res.render('schedule', {
            user: req.user,
            schedule: schedule,
            candidates: candidates,
            users: users,
            // 出欠データのMapをjadeから参照できるようにする
            availabilityMapMap: availabilityMapMap
          });
        });
      });
    } else {
      const err = new Error('指定された予定は見つかりません');
      err.status = 404;
      next(err);
    }
  });
  scheduleJs_debugger('GET(schedule/{scheduleId})処理開始')
});

module.exports = router;