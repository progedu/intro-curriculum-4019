'use strict';
const request = require('supertest');
const app = require('../app');
const passportStub = require('passport-stub');
const User = require('../models/user');
const Schedule = require('../models/schedule');
const Candidate = require('../models/candidate');
const Availability = require('../models/availability');
//1 出欠更新DB保存
const assert = require('assert');

describe('/login', () => {
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ username: 'testuser' });
  });

  afterAll(() => {
    passportStub.logout();
    passportStub.uninstall(app);
  });
  test('ログインのためのリンクが含まれる', () => {
    return request(app)
      .get('/login')
      .expect('Content-Type', 'text/html; charset=utf-8')
      .expect(/<a href="\/auth\/github"/)
      .expect(200);
  });
  
  test('ログイン時はユーザー名が表示される', () => {
    return request(app)
      .get('/login')
      .expect(/testuser/)
      .expect(200);
  });
});

describe('/logout', () => {
  test('/ にリダイレクトされる', () => {
    return request(app)
      .get('/logout')
      .expect('Location', '/')
      .expect(302);
  });
});

describe('/schedules', () => {
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, username: 'testuser' });
  });

  afterAll(() => {
    passportStub.logout();
    passportStub.uninstall(app);
  });

  test('予定が作成でき、表示される', done => {
    User.upsert({ userId: 0, username: 'testuser' }).then(() => {
      request(app)
        .post('/schedules')
        .send({
          scheduleName: 'テスト予定1',
          memo: 'テストメモ1\r\nテストメモ2',
          candidates: 'テスト候補1\r\nテスト候補2\r\nテスト候補3'
        })
        .expect('Location', /schedules/)
        .expect(302)
        .end((err, res) => {
          const createdSchedulePath = res.headers.location;
          request(app)
            .get(createdSchedulePath)
            .expect(/テスト予定1/)
            .expect(/テストメモ1/)
            .expect(/テストメモ2/)
            .expect(/テスト候補1/)
            .expect(/テスト候補2/)
            .expect(/テスト候補3/)
            .expect(200)
            .end((err, res) => { deleteScheduleAggregate(createdSchedulePath.split('/schedules/')[1], done, err);});
        });
    });
  });
});

describe('/schedules/:scheduleId/users/:userId/candidates/:candidateId', () => {
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, username: 'testuser' });
  });

  afterAll(() => {
    passportStub.logout();
    passportStub.uninstall(app);
  });
  
  test('出欠が更新できる', (done) => {
    User.upsert({ userId: 0, username: 'testuser' }).then(() => {
      request(app)
        .post('/schedules')
        .send({ scheduleName: 'テスト出欠更新予定1', memo: 'テスト出欠更新メモ1', candidates: 'テスト出欠更新候補1' })
        .end((err, res) => {
          const createdSchedulePath = res.headers.location;
          const scheduleId = createdSchedulePath.split('/schedules/')[1];
          Candidate.findOne({
            where: { scheduleId: scheduleId }
          }).then((candidate) => {
            // 更新がされることをテスト
            const userId = 0;
            request(app)
              .post(`/schedules/${scheduleId}/users/${userId}/candidates/${candidate.candidateId}`)
              .send({ availability: 2 }) // 出席に更新
              .expect('{"status":"OK","availability":2}')
              ////予定に関連する出欠情報が 1 つあることと、 その内容が更新された 2 であることをテストしています。
              //###################################
              //1 出欠更新DB保存
              //.end((err, res) => { deleteScheduleAggregate(scheduleId, done, err); });
              .end((err, res) => {
                Availability.findAll({
                  where: { scheduleId: scheduleId }
                }).then((availabilities) => {
                  // TODO ここにテストを記述する
                  deleteScheduleAggregate(scheduleId, done, err);
                });
              });
              //Availability.findAll 関数はデータベースから where で条件を指定した全ての出欠を取得します。
              // また結果オブジェクトの then 関数を呼び出すことで、そこで渡す無名関数の引数 availabilities には、 出欠のモデルである models/availability.js で定義したモデルの配列が渡されます。
              //###########################
              
            });
        });
    });
  });
});
  
function deleteScheduleAggregate(scheduleId, done, err) {
  Availability.findAll({
    where: { scheduleId: scheduleId }
  }).then((availabilities) => {
    const promises = availabilities.map((a) => { return a.destroy(); });
    Promise.all(promises).then(() => {
      Candidate.findAll({
        where: { scheduleId: scheduleId }
      }).then((candidates) => {
        const promises = candidates.map((c) => { return c.destroy(); });
        Promise.all(promises).then(() => {
          Schedule.findByPk(scheduleId).then((s) => {
            s.destroy().then(() => {
              if (err) return done(err);
              done();
            });
          });
        });
      });
    });
  });
}