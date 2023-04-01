const md5=require("md5");
const genRandomString = (length = 10) => {
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    // Pick characers randomly
    let str = '';
    for (let i = 0; i < length; i++) {
        str += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return str;
};

// adds suffix counter to "sensitiveData" from module suffix
const addModuleNumber= (moduleElementData, number, varPass, id) => {
    moduleElementData = moduleElementData.replace(/sensitiveData_€/g, 'a' + md5('sensitiveData_'+number+'_'+ varPass));
    moduleElementData= moduleElementData.replace(/sensitiveData_₹/g, 'a' + md5('sensitiveData_'+number+'_'+id));

    return moduleElementData;
}
const sortByNumber = (list) => {
    const result = {};
    list.sort((a, b) => {
        const aNum = parseInt(a.match(/\d+$/));
        const bNum = parseInt(b.match(/\d+$/));
        return aNum - bNum;
    }).forEach((item) => {
        const num = parseInt(item.match(/\d+$/));
        if (!result[num]) {
            result[num] = [];
        }
        result[num].push(item);
    });

    return result;
};

const tmcList = (str) => {
    const firstSpaceIndex = str.indexOf(' ');
    const tmcString = str.slice(firstSpaceIndex + 1);
    const tmcStringList = tmcString.split(/(\s+)/).filter( e => e.trim().length > 0)
    return tmcStringList;
};


module.exports = {
    genRandomString,
    addModuleNumber,
    sortByNumber,
    tmcList
};