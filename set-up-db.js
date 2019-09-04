const SQLite = require('@nano-sql/adapter-sqlite').SQLite;
const nSQL = require('@nano-sql/core').nSQL;

const dropTables = async () => {
    await nSQL("terms").query("drop").exec();
    await nSQL("translations").query("drop").exec();
    return;
};

module.exports = () => {
    return nSQL().createDatabase({
        id: "flash",
        mode: new SQLite("flash.sqlite3"),
        tables: [
            {
                name: "terms",
                model: {
                    "id:uuid": {pk: true},
                    "self:string": {idx: true},
                    "language:string": {idx: true},
                    "sense:string": {},
                    "part:string": {},
                    "streak:int": {},
                    "archived:bool": {idx: true}
                },
                views: [
                    {
                        name: 'get_all_terms_by_language',
                        args: ['language:string', 'limit:int'],
                        call: async (opts, db) => {
                            return db.query('select').where([
                                ['language', '=', opts.language],
                                "AND",
                                ['archived', '=', false]
                            ]).orderBy(['RANDOM(id) DESC']).limit(opts.limit).exec();
                        }
                    }
                ]
            },
            {
                name: "translations",
                model: {
                    "id:uuid": {pk: true},
                    "fromId:uuid": {idx: true},
                    "toId:uuid": {idx: true}
                }
            }
        ]
    });
};
