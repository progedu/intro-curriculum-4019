// 厳格モード
'use strict';

console.log('テスト開始');

// テスト用モジュール読み込み
const request = require('supertest');
const assert = require('assert');

// app.js読み込み
const app = require('../app');

// 必要なモデル読み込み
const User = require('../models/user');
const Candidate = require('../models/candidate');
const Schedule = require('../models/schedule');
const Availability = require('../models/availability');

// passport-stubモジュール読み込み
// スタブ：テスト対象から呼び出される別のモジュールの代用品
const passportStub = require('passport-stub');

// mochaのテストの書式
// 第一引数：一連のテストの名前
// 第二引数：個々のテスト処理(it処理)を含む無名関数
describe('/login',
  () => {
    console.log('/login関連のテスト開始');
    // 一連のit処理の前に実行される処理
    before(
      () => {
        console.log('BEFORE処理開始');
        // passportStubをインストールする 
        passportStub.install(app);
        // usernameプロパティを指定する…のは
        // passportの仕様に従ってるんじゃないかなぁ
        passportStub.login({ username: 'testuser' });
        console.log('BEFORE処理終了');
      }
    );

    // 一連のit処理の後に実行される処理
    after(
      () => {
        console.log('AFTER処理開始');
        // ログアウト
        passportStub.logout();
        // ↓必要なのかどうかよくわからない
        passportStub.uninstall(app);
        console.log('AFTER処理完了');
      }
    );

    // 個々のテスト処理
    // 第一引数：個々のテストの名前
    // 第二引数：実際のテスト処理を行う関数(assert処理など)
    it('ログインのためのリンクが含まれる',
      // supertestモジュールの書式
      // ドキュメント：https://github.com/visionmedia/supertest
      (done) => {
        console.log('test1開始');
        // 対象のアプリを引数にオブジェクトを作成して
        request(app)
          // /loginにアクセスして
          .get('/login')
          // ヘッダの値をチェックして
          .expect('Content-Type', 'text/html; charset=utf-8')
          // <body>タグ内に
          // <a href="auth/github"という文字列があるかをチェックする
          .expect(/<a href="\/auth\/github"/)
          // 期待されるステータスコードと引数のCB関数を渡すと終了？
          .expect(200, done);
        console.log('test1完了');
      }
    );

    // 大体↑と一緒
    it('ログイン時はユーザー名が表示される',
      (done) => {
        console.log('test2開始');
        request(app)
          .get('/login')
          .expect(/testuser/)
          .expect(200, done);
        console.log('test2完了');
      }
    );
  }
);

describe('/logout',
  () => {
    console.log('/logout関連のテスト開始');

    // 個々のテスト処理
    // 第一引数：個々のテストの名前
    // 第二引数：実際のテスト処理を行う関数(assert処理など)
    it('/logout にアクセスした際に / にリダイレクトされる',
      (done) => {
        console.log('test3開始');
        request(app)
          .get('/logout')
          .expect('Location', '/')
          .expect(302, done);
        console.log('test3完了');
      }
    );
  }
);

// schedule関連のテスト
describe('/schedules', () => {
  // テスト前処理
  before(() => {
    // passportStubを作成
    passportStub.install(app);
    // stubを使ってログイン
    passportStub.login({ id: 0, username: 'testuser' });
  });
  // テスト後処理
  after(() => {
    // ログアウト
    passportStub.logout();
    // 一応アンインスコ
    passportStub.uninstall(app);
  });

  it('予定が作成でき、表示される', (done) => {
    console.log('テスト開始：予定が作成でき、表示される');
    // Userモデルを作成して
    User.upsert({ userId: 0, username: 'testuser' }).then(() => {
      // うまくいったらテスト開始
      request(app)
        // schedulesにPOSTでデータを渡す
        // ここで１つのScheduleと複数のCandidateがデータベースに登録される
        .post('/schedules')
        .send({ scheduleName: 'テスト予定1', memo: 'テストメモ1\r\nテストメモ2', candidates: 'テスト候補1\r\nテスト候補2\r\nテスト候補3' })
        // schedulesにリダイレクトされるか
        .expect('Location', /schedules/)
        // 302 redirectか
        .expect(302)
        // 終わったら次ののテストに移る
        .end((err, res) => {
          const createdSchedulePath = res.headers.location;
          console.dir(res.headers);
          console.log('createdSchedulePath => ' + createdSchedulePath);
          // createdSchedulePath => /schedules/{scheduleId}
          // テスト開始
          request(app)
            // /schedules/{scheduleId}にGETでアクセスして
            .get(createdSchedulePath)
            // ちゃんと表示されてることを確認する
            .expect(/テスト予定1/)
            .expect(/テストメモ1/)
            .expect(/テストメモ2/)
            .expect(/テスト候補1/)
            .expect(/テスト候補2/)
            .expect(/テスト候補3/)
            // 200 アクセス成功
            .expect(200)
            .end((err, res) => {
              // scheduleIdに紐付いているレコードをまとめて削除する
              deleteScheduleAggregate(createdSchedulePath.split('/schedules/')[1], done, err);
            });
        });
    });
    console.log('テスト終了：予定が作成でき、表示される');
  });

});

// schedule関連のテスト２
describe('/schedules/:scheduleId/users/:userId/candidates/:candidateId', () => {
  // テスト前処理
  before(() => {
    // passportStubを作成
    passportStub.install(app);
    // stubを使ってログイン
    passportStub.login({ id: 0, username: 'testuser' });
  });
  // テスト後処理
  after(() => {
    // ログアウト
    passportStub.logout();
    // 一応アンインスコ
    passportStub.uninstall(app);
  });


  it('出欠が更新できる', (done) => {
    console.log('テスト開始：出欠が更新できる');
    // Userを追加する
    User.upsert({ userId: 0, username: 'testuser' }).then(() => {
      // テスト開始
      request(app)
        // schedulesにPOSTでアクセスし、各パラメーターを渡す
        // ここで１つのScheduleと複数のCandidateがデータベースに登録される
        // memoはscheduleモデルに含まれる要素
        .post('/schedules')
        .send({ scheduleName: 'テスト出欠更新予定1', memo: 'テスト出欠更新メモ1', candidates: 'テスト出欠更新候補1' })
        // 次に移る
        .end((err, res) => {
          // レスポンスヘッダからURLを取得
          // createdSchedulePath => /schedules/{scheduleId}
          const createdSchedulePath = res.headers.location;
          // splitしてscheduleIdを取得
          const scheduleId = createdSchedulePath.split('/schedules/')[1];
          // scheduleIdでひもづけられる候補日を１件取得する
          Candidate.findOne({
            where: { scheduleId: scheduleId }
          }).then((candidate) => {
            // 更新がされることをテスト
            request(app)
              // /schedules/{scheduleId}/users/0/candidates/{candidate.candidateId}
              // にPOSTでアクセスして、availabilitiesのルーターで定義している
              // APIの動作を確認する
              .post(`/schedules/${scheduleId}/users/${0}/candidates/${candidate.candidateId}`)
              // 2は出席を表す
              .send({ availability: 2 }) // 出席に更新
              // 出席に更新されたJSON形式のレスポンスが帰ってくればOK
              .expect('{"status":"OK","availability":2}')
              // 終わったらscheduleId絡みのレコードをすべて削除する
              .end((err, res) => {
                Availability.findAll({
                  where: { scheduleId: scheduleId }
                }).then((availabilities) => {
                  // console.log('=== DBから取得 ===');
                  // console.dir(availabilities);
                  // console.log('=== レスポンスから取得 ===');
                  // console.dir(res);
                  // console.log('配列長');
                  // console.dir(availabilities.length);
                  // console.log('Availability');
                  // console.dir(availabilities[0].availability);
                  // console.dir(res.body.availability);

                  // DBからscheduleIdに紐付いたavailabilityを１件だけ取得できればOK
                  assert.equal(availabilities.length, 1);
                  // DBに登録されているscheduleIdに紐付いたavailabilityの値と
                  // responseとして帰ってきているavailabilityの値が同一ならOK
                  assert.equal(availabilities[0].availability, res.body.availability);
                  deleteScheduleAggregate(scheduleId, done, err);
                });
              });
          });
        });
    });
    console.log('テスト終了：出欠が更新できる');
  });
});

// scheduleIdに紐付いているレコードをまとめて削除する
function deleteScheduleAggregate(scheduleId, done, err) {
  // scheduleIdとひもづいている出欠モデルを取得する
  Availability.findAll({
    where: { scheduleId: scheduleId }
  }).then((availabilities) => {
    // scheduleIdとひもづいている出欠モデルをすべて削除する
    const promises = availabilities.map((a) => { return a.destroy(); });
    // 削除が終了したら
    Promise.all(promises).then(() => {
      // scheduleIdと紐付いている候補日モデルを取得する
      Candidate.findAll({
        where: { scheduleId: scheduleId }
      }).then((candidates) => {
        // scheduleIdと紐付いている候補日モデルを全て削除する
        const promises = candidates.map((c) => { return c.destroy(); });
        // 削除が終了したら
        Promise.all(promises).then(() => {
          // ScheduleIdで特定されるSchedule自体を削除する
          Schedule.findById(scheduleId).then((s) => { s.destroy(); });
          if (err) return done(err);
          done();
        });
      });
    });
  });
}