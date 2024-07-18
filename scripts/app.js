// Effective Armour Penetration is the amount of damage dealt through armour
// based on the weapon's armour penetration and the enemy's armour hardness
function effectiveArmorPenetration(
    armorPenetration,
    armorHardness
) {
    // Armour penetrating damage is calculated with AP - AH + 1
    // Clamp Effective Armour Penetration between 0 and 1
    return Math.max(0, Math.min(1, armorPenetration - armorHardness + 1));
}

function shotsToKill(
    damage,
    critMultiplier,
    effectiveArmorPenetration,
    enemyHealth,
    enemyArmor,
	enemyName
) {
    if (critMultiplier < 1){ critMultiplier = 1;}

    const critDamage = damage * critMultiplier,
          APDamage = damage * effectiveArmorPenetration,
          critAPDamage = critDamage * effectiveArmorPenetration;
		  if (selectedSkills.includes('Expose') && enemyArmor !== 3500 && enemyArmor > 50){
		enemyArmor = 0;
	}
    const shotsOnArmor = Math.min(
        Math.ceil(enemyArmor / damage),
        Math.ceil(enemyHealth / critAPDamage)
    );
    const remainingHealth = Math.max(0, Math.floor(enemyHealth - (critAPDamage * shotsOnArmor)));
    const shotsOnHealth = Math.ceil(remainingHealth / critDamage);

    if (critMultiplier > 1) {
        // Calculate how many crits can be replaced
        // based on damage left over after the kill
        const overdamage = critDamage - (remainingHealth % critDamage || critDamage);
        const replacableCrits = Math.min(
            shotsOnHealth,
            Math.floor(overdamage / (critDamage - damage))
        );
        
        // Calculate how many crits through armour can be replaced
        // based on extra health after replacing crits
        //
        // If the enemy dies from armour penetrating shots,
        // use the damage left over after the kill instead
        const armorOverdamage =
            overdamage - (replacableCrits * (critDamage - damage)) ||
            critAPDamage - (enemyHealth % critAPDamage || critAPDamage);
        const replacableArmoredCrits = Math.min(
            shotsOnArmor,
            Math.floor(armorOverdamage / (critAPDamage - APDamage) || shotsOnArmor)
        );

        return {
            armoredCrits: shotsOnArmor - replacableArmoredCrits,
            armoredNonCrits: replacableArmoredCrits,
            unarmoredCrits: shotsOnHealth - replacableCrits,
            unarmoredNonCrits: replacableCrits,
            totalShots: shotsOnArmor + shotsOnHealth
        }
    }
    return {
        armoredCrits: 0,
        armoredNonCrits: shotsOnArmor,
        unarmoredCrits: 0,
        unarmoredNonCrits: shotsOnHealth,
        totalShots: shotsOnArmor + shotsOnHealth
    }
}

// Returns the shots to kill at each unique distance
function weaponShotsToKill(
    weaponName,
    enemyName,
    selectedSkills
) {
    const weapon = weaponData[weaponName],
          enemy = enemyData[enemyName];

    // Create a new array of distances
    // based on the distance arrays in a weapon's stats
    // ordered from highest to lowest
    const distanceArray = [... new Set([
        ...weapon.DamageDistanceArray.map(dist => dist.Distance),
        ...weapon.CriticalDamageMultiplierDistanceArray.map(dist => dist.Distance),
        500 // Add 5m distance for Face to Face
    ])].sort((a, b) => b - a);

    let damageMultiplier = 1,
        armorPenetrationModifier = 0;

    if (!weapon.ArmorPenetration) weapon.ArmorPenetration = 0;

    // Apply damage and AP buffs from skills
    if (selectedSkills.includes('edge'))
        damageMultiplier += skills.edge.damageMultiplier;
    if (selectedSkills.includes('coupdegrace') && enemyName !== 'Bulldozer')
        damageMultiplier += skills.coupdegrace.damageMultiplier;
    if (selectedSkills.includes('combatmarking'))
        damageMultiplier += skills.combatmarking.damageMultiplier;
    if (selectedSkills.includes('painasymbolia'))
        damageMultiplier += skills.painasymbolia.damageMultiplier;
    if (selectedSkills.includes('highgrain'))
        armorPenetrationModifier += skills.highgrain.armorPenetrationModifier;
    
    const EAP = effectiveArmorPenetration(
            weapon.ArmorPenetration + armorPenetrationModifier,
            enemy.ArmorHardness
          );

    let shotsAtDistances = {},
        previous = {};

    distanceArray.forEach(distance => {
        const damage = (weapon.DamageDistanceArray.find(i => i.Distance >= distance) ??
                  weapon.DamageDistanceArray.slice(-1)[0]).Damage;
        
        let multiplier = (weapon.CriticalDamageMultiplierDistanceArray.find(i => i.Distance >= distance) ??
                weapon.CriticalDamageMultiplierDistanceArray.slice(-1)[0]).Multiplier;
        
        if (!selectedSkills.includes('headshot')) multiplier = 1;
        if (selectedSkills.includes('headshot') && selectedSkills.includes('longshot'))
            multiplier = weapon.CriticalDamageMultiplierDistanceArray[0].Multiplier;
        if (enemyName == 'Drone') multiplier = 1;
        if (distance <= 500 && selectedSkills.includes('facetoface'))
            damageMultiplier += skills.facetoface.damageMultiplier;

        const weaponShotsToKill = shotsToKill(
            damage * damageMultiplier,
            multiplier,
            EAP,
            enemy.Health,
            // If headshots are enabled assume the dozer's face is unarmoured
            enemyName == 'Bulldozer' && selectedSkills.includes('headshot') ?
                0 :
                enemy.Armor
        );

        // Calculation only includes headshots if headshots are enabled
        if (enemyName == 'Bulldozer' && selectedSkills.includes('headshot')) {
            weaponShotsToKill.unarmoredCrits += weaponShotsToKill.unarmoredNonCrits;
            weaponShotsToKill.unarmoredNonCrits = 0;
        }
        
        // Remove duplicates
        if (
            previous &&
            weaponShotsToKill.armoredCrits != previous.armoredCrits ||
            weaponShotsToKill.armoredNonCrits != previous.armoredNonCrits ||
            weaponShotsToKill.unarmoredCrits != previous.unarmoredCrits ||
            weaponShotsToKill.unarmoredNonCrits != previous.unarmoredNonCrits
        ) shotsAtDistances[distance] = weaponShotsToKill;
        previous = weaponShotsToKill;
    });

    return shotsAtDistances;
}

function timeToKill(
    shotsToKill,
    roundsPerMinute,
    pelletCount,
    magSize,
    reloadTime
) {
    if (!roundsPerMinute) roundsPerMinute = 600;
    if (!pelletCount) pelletCount = 1;
    else shotsToKill = Math.ceil(shotsToKill / pelletCount);

    let TTK = (shotsToKill - 1) / (roundsPerMinute / 60);
    if (reloadTime && magSize && shotsToKill > magSize)
        TTK += reloadTime * Math.floor(shotsToKill / magSize);

    return Math.round(TTK * 100) / 100;
}

function initialiseWeaponData() {
    // Create a list of weapons organised by their class
    let weaponList = {};
    for (const weapon in weaponData) {
        const weaponClass = weaponData[weapon].Class
        weaponList[weaponClass] = weaponList[weaponClass] || [];
        weaponList[weaponClass].push(weapon)
    }

    // Populate the weapon selector separated by class
    const weaponSelector = document.querySelector('#weapon-selector');
    for (const weaponClass in weaponList) {
        const weaponSelectorGroup = weaponSelector.appendChild(document.createElement('optgroup'));
        weaponSelectorGroup.setAttribute('label', weaponClass);

        weaponList[weaponClass].forEach((weapon) => {
            const weaponSelectorOption = weaponSelector.appendChild(document.createElement('option'));
            weaponSelectorOption.setAttribute('value', weapon);
            weaponSelectorOption.textContent = weapon;
        });
    }

    Object.keys(skills).forEach(skill => {
        const weaponSkillButton = document.querySelector('#weapon-skills')
            .appendChild(document.createElement('button'));
        weaponSkillButton.setAttribute('type', 'button');
        weaponSkillButton.setAttribute('value', skill);
        weaponSkillButton.setAttribute('class', 'weapon-skill glass tooltip-wrapper');
        weaponSkillButton.setAttribute('aria-pressed', 'false');

        // Disable buttons for skills that require edge
        if (edgeSkills.includes(skill))
            weaponSkillButton.setAttribute('disabled', '');

        const weaponSkillIcon = weaponSkillButton.appendChild(document.createElement('img'));
        weaponSkillIcon.setAttribute('src', 'images/skills/' + skill + '.png');
        weaponSkillIcon.setAttribute('alt', skill);

        const weaponSkillTooltip = weaponSkillButton.appendChild(document.createElement('div'));
        weaponSkillTooltip.setAttribute('class', 'tooltip');
        
        const tooltipTitle = weaponSkillTooltip.appendChild(document.createElement('span'));
        tooltipTitle.setAttribute('class', 'tooltip-title');
        tooltipTitle.textContent = skills[skill].name;

        const tooltipBody = weaponSkillTooltip.appendChild(document.createElement('p'));
        tooltipBody.setAttribute('class', 'tooltip-body');
        tooltipBody.innerHTML = edgeSkills.includes(skill) ?
            'Requires Edge.<br/>' + skills[skill].description :
            skills[skill].description;
    });
}

function updateDamageData(
    selectedWeapon,
    selectedSkills
) {
    const damageChart = document.querySelector('#damage-data');

    damageChart.textContent = '';

    let currentCard = 0;

    for (const enemyName in enemyData) {
        const shotsAtDistances = weaponShotsToKill(
                  selectedWeapon,
                  enemyName,
                  selectedSkills
              ),
              armorPenetration = weaponData[selectedWeapon].ArmorPenetration
                + (selectedSkills.includes('highgrain') ? skills.highgrain.armorPenetrationModifier : 0),
              EAP = effectiveArmorPenetration(
                  armorPenetration,
                  enemyData[enemyName].ArmorHardness
              );

        let damageStats = document.createElement('div');
        damageStats.setAttribute('class', 'damage-stats-card card');
        damageChart.appendChild(damageStats);
    
        let statDisplay = document.createElement('div');
        statDisplay.setAttribute('class', 'damage-stats');
        damageStats.appendChild(statDisplay);

        // If the enemy is a dozer or a shield and headshot is enabled
        // display the shots required and TTK to break their visor
        if (
            (enemyName == 'Bulldozer' || enemyName == 'Shield') &&
            selectedSkills.includes('headshot')
        ) {
            let visorDisplay = document.createElement('p');
            visorDisplay.setAttribute('class', 'visor-damage glass');
            
            let damage = weaponData[selectedWeapon].DamageDistanceArray[0].Damage,
                damageMultiplier = 1,
                distance = weaponData[selectedWeapon].DamageDistanceArray[0].Distance / 100;

            const visorArmorHardness = enemyData[enemyName].VisorArmorHardness;

            if (armorPenetration > visorArmorHardness - 1) {
                visorDisplay.innerHTML = `Rounds can penetrate visor`;
            } else {
                visorDisplay.setAttribute('class', 'visor-damage glass cracked');

                if (selectedSkills.includes('edge'))
                    damageMultiplier += skills.edge.damageMultiplier;
                if (selectedSkills.includes('facetoface')) {
                    damageMultiplier += skills.facetoface.damageMultiplier;
                    distance = 5;
                }
                if (selectedSkills.includes('combatmarking'))
                    damageMultiplier += skills.combatmarking.damageMultiplier;
                if (selectedSkills.includes('painasymbolia'))
                    damageMultiplier += skills.painasymbolia.damageMultiplier;

    
                let shotsToBreakVisor = Math.ceil(
                        enemyData[enemyName].VisorArmor / (damage * damageMultiplier)
                    ),
                    timeToBreakVisor = timeToKill(
                        shotsToBreakVisor,
                        weaponData[selectedWeapon].RoundsPerMinute,
                        weaponData[selectedWeapon].ProjectilesPerFiredRound,
                        weaponData[selectedWeapon].AmmoLoaded ?? 10,
                        weaponData[selectedWeapon].ReloadEmptyNotifyTime
                    );

                
                if (weaponData[selectedWeapon].ProjectilesPerFiredRound > 1) {
                    shotsToBreakVisor = Math.ceil(shotsToBreakVisor / weaponData[selectedWeapon].ProjectilesPerFiredRound);
                }

                const reloadCount = Math.floor((shotsToBreakVisor - 1) / (weaponData[selectedWeapon].AmmoLoaded ?? 10));
    
                visorDisplay.textContent = `${shotsToBreakVisor} shots required to break visor at ${distance}m`;
                let visorDisplayTTK = document.createElement('span')
                visorDisplayTTK.setAttribute('class', 'time-to-kill');
                visorDisplayTTK.textContent += `${timeToBreakVisor} seconds, `
                visorDisplayTTK.textContent += `includes ${reloadCount} ${reloadCount != 1 ? 'reloads' : 'reload'}`
                visorDisplay.appendChild(visorDisplayTTK);
            }
            damageStats.appendChild(visorDisplay);
        }

        // Populate the damage chart with weapon name and equipped skills
        let damageStatsWeapon = document.createElement('div');
        damageStatsWeapon.setAttribute('class', 'damage-stats-weapon');

        let damageStatsWeaponName = document.createElement('h2');
        damageStatsWeaponName.setAttribute('class', 'weapon-name');
        damageStatsWeaponName.textContent = selectedWeapon;
        damageStatsWeapon.appendChild(damageStatsWeaponName);

        if (selectedSkills) {
            let damageStatsWeaponSkills = document.createElement('div');
            damageStatsWeaponSkills.setAttribute('class', 'weapon-skills');
            selectedSkills.forEach(skill => {
                let weaponSkillBadge = document.createElement('span');
                weaponSkillBadge.setAttribute('class', 'weapon-skill');
                weaponSkillBadge.setAttribute('aria-pressed', 'true');
    
                if ((!EAP ||
                    !enemyData[enemyName].ArmorHardness) &&
                    skill == 'highgrain'
                ) weaponSkillBadge.setAttribute('disabled', '');
    
                if (enemyName == 'Bulldozer' &&
                    skill == 'coupdegrace'
                ) weaponSkillBadge.setAttribute('disabled', '');
                if (enemyName == 'Bulldozer' &&skill == 'Expose') weaponSkillBadge.setAttribute('disabled', '');
				if (enemyName == 'Sniper' &&skill == 'Expose') weaponSkillBadge.setAttribute('disabled', '');
				if (enemyName == 'Cloaker' &&skill == 'Expose') weaponSkillBadge.setAttribute('disabled', '');
				if (enemyName == 'Drone' &&skill == 'Expose') weaponSkillBadge.setAttribute('disabled', '');
                let weaponSkillIcon = document.createElement('img');
                weaponSkillIcon.setAttribute('src', './images/skills/' + skill + '.png');
                weaponSkillIcon.setAttribute('alt', skill);
                weaponSkillBadge.appendChild(weaponSkillIcon);
    
                damageStatsWeaponSkills.appendChild(weaponSkillBadge);
            });
    
            damageStatsWeapon.appendChild(damageStatsWeaponSkills);
            statDisplay.appendChild(damageStatsWeapon);
        }

        let damageBracketContainer = document.createElement('div');
        damageBracketContainer.setAttribute('class', 'damage-bracket-container');
        statDisplay.appendChild(damageBracketContainer);

        // Populate the damage chart with shots to kill at different distances
        const damageBracketCount = 3;
        for (let i = 0; i < damageBracketCount; i++) {
            const distance = Object.keys(shotsAtDistances)[i];
            if (!distance) break;

            const TTK = timeToKill(
                      shotsAtDistances[distance].totalShots,
                      weaponData[selectedWeapon].RoundsPerMinute,
                      weaponData[selectedWeapon].ProjectilesPerFiredRound,
                      weaponData[selectedWeapon].AmmoLoaded ?? 10,
                      weaponData[selectedWeapon].ReloadEmptyNotifyTime
                  ),
                  armoredCrits = shotsAtDistances[distance].armoredCrits,
                  armoredNonCrits = shotsAtDistances[distance].armoredNonCrits,
                  unarmoredCrits = shotsAtDistances[distance].unarmoredCrits,
                  unarmoredNonCrits = shotsAtDistances[distance].unarmoredNonCrits;
            
            let totalShotsToKill = shotsAtDistances[distance].totalShots;

            if (weaponData[selectedWeapon].ProjectilesPerFiredRound > 1) {
                totalShotsToKill = Math.ceil(shotsAtDistances[distance].totalShots / weaponData[selectedWeapon].ProjectilesPerFiredRound);
            }

            let damageBracket = document.createElement('div');
            damageBracket.setAttribute('class', 'damage-bracket');
            
            damageBracketContainer.appendChild(damageBracket);

            let damageBracketDistance = document.createElement('h2')
            damageBracketDistance.setAttribute('class', 'distance');
            damageBracketDistance.textContent = distance / 100 + " meters";
            damageBracket.appendChild(damageBracketDistance);

            let damageBracketShots = document.createElement('h1')
            damageBracketShots.setAttribute('class', 'shots-to-kill');
            damageBracketShots.textContent = totalShotsToKill + (totalShotsToKill != 1 ? ' shots' : ' shot');
            damageBracket.appendChild(damageBracketShots);

            if (armoredCrits || armoredNonCrits) {
                let damageBracketArmored = document.createElement('span');
                if (EAP) {
                    damageBracketArmored.setAttribute('class', 'enemy-armor penetrating-armored-shots');
                } else {
                    damageBracketArmored.setAttribute('class', 'enemy-armor');
                }

                let shotsText = [];
                if (armoredCrits) shotsText.push(armoredCrits + (armoredCrits != 1 ? ' crits' : ' crit'));
                if (armoredNonCrits) shotsText.push(armoredNonCrits + ' body');
                damageBracketArmored.textContent = shotsText.join(' + ');
                damageBracket.appendChild(damageBracketArmored);
            }
            if (unarmoredCrits || unarmoredNonCrits) {
                let damageBracketUnarmored = document.createElement('span')
                damageBracketUnarmored.setAttribute('class', 'enemy-health');
                let shotsText = [];
                if (unarmoredCrits) shotsText.push(unarmoredCrits + (unarmoredCrits != 1 ? ' crits' : ' crit'));
                if (unarmoredNonCrits) shotsText.push(unarmoredNonCrits + ' body');
                damageBracketUnarmored.textContent = shotsText.join(' + ');
                damageBracket.appendChild(damageBracketUnarmored);
            }

            let damageBracketTTK = document.createElement('span');
            damageBracketTTK.setAttribute('class', 'time-to-kill');
            damageBracketTTK.textContent = TTK + " seconds";
            damageBracket.appendChild(damageBracketTTK);

            const reloadCount = Math.floor((totalShotsToKill - 1) / (weaponData[selectedWeapon].AmmoLoaded ?? 10));
            if (reloadCount >= 1) {
                let damageBracketReloads = document.createElement('span');
                damageBracketReloads.setAttribute('class', 'time-to-kill');
                damageBracketReloads.textContent += `${reloadCount} ${reloadCount != 1 ? 'reloads' : 'reload'}`
                damageBracket.appendChild(damageBracketReloads);
            }
        }

        // Populate the damage chart with enemy name and stats
        let damageStatsEnemy = document.createElement('div');
        damageStatsEnemy.setAttribute('class', 'damage-stats-enemy');

        let damageStatsEnemyName = document.createElement('h2');
        damageStatsEnemyName.setAttribute('class', 'enemy-name');
        damageStatsEnemyName.textContent = enemyName;
        damageStatsEnemy.appendChild(damageStatsEnemyName);

        let damageStatsEnemyArmor = document.createElement('span');
        damageStatsEnemyArmor.setAttribute('class', 'enemy-armor');
        damageStatsEnemyArmor.textContent = enemyData[enemyName].Armor + " Armor";
        damageStatsEnemy.appendChild(damageStatsEnemyArmor);

        let damageStatsEnemyHealth = document.createElement('span');
        damageStatsEnemyHealth.setAttribute('class', 'enemy-health');
        damageStatsEnemyHealth.textContent = enemyData[enemyName].Health + " Health";
        damageStatsEnemy.appendChild(damageStatsEnemyHealth);

        if (enemyData[enemyName].ArmorHardness) {
            let damageStatsEnemyHardness = document.createElement('span');
            damageStatsEnemyHardness.setAttribute('class', 'enemy-armor-hardness');
            damageStatsEnemyHardness.textContent = enemyData[enemyName].ArmorHardness + " Hardness";
            damageStatsEnemy.appendChild(damageStatsEnemyHardness);
        }

        statDisplay.appendChild(damageStatsEnemy);

        // Set CSS variables for weapon and enemy background images
        damageStats.style.setProperty('--weapon-image', `url("images/weapons/${selectedWeapon}.jpg")`);
        damageStats.style.setProperty('--enemy-image', `url("images/enemies/${enemyName}.jpg")`);

        damageStats.appendChild(statDisplay)

        damageStats.style.transitionDelay = (currentCard++ * 0.03) + 's';
        damageStats.style.transform = 'scale(0.95)';
        setTimeout(() => {
            damageStats.style.transform = 'scale(1)';
        });
    }

    document.querySelector('#selected-weapon')
        .style.setProperty('--weapon-image', `url("images/weapons/${selectedWeapon}.jpg")`);
}

function updateWeaponStats(
    selectedWeapon
) {
    const weapon = weaponData[selectedWeapon];

    const damageStats = document.querySelector('#weapon-damage-stats'),
          critStats = document.querySelector('#weapon-crit-stats');

    damageStats.innerHTML = '';

    weapon.DamageDistanceArray.forEach(distance => {
        const weaponDamageRow = damageStats.appendChild(document.createElement('tr'));

        const weaponDamageDistance = weaponDamageRow.appendChild(document.createElement('td'));
        weaponDamageDistance.setAttribute('class', 'weapon-stat-distance');
        weaponDamageDistance.textContent = distance.Distance / 100 + 'm';

        const weaponDamageStat = weaponDamageRow.appendChild(document.createElement('td'));
        weaponDamageStat.setAttribute('class', 'weapon-stat');
        weaponDamageStat.textContent = Math.round(distance.Damage * 10) / 10;

        if (weapon.ProjectilesPerFiredRound && weapon.ProjectilesPerFiredRound > 1) {
            const weaponPelletCount = weaponDamageStat.appendChild(document.createElement('span'));
            weaponPelletCount.setAttribute('class', 'weapon-pellet-count');
            weaponPelletCount.textContent += `×${weapon.ProjectilesPerFiredRound}`
        }
    });

    critStats.innerHTML = '';

    weapon.CriticalDamageMultiplierDistanceArray.forEach(distance => {
        const weaponCritRow = critStats.appendChild(document.createElement('tr'));

        const weaponCritDistance = weaponCritRow.appendChild(document.createElement('td'));
        weaponCritDistance.setAttribute('class', 'weapon-stat-distance');
        weaponCritDistance.textContent = distance.Distance / 100 + 'm';
    
        const weaponCritStat = weaponCritRow.appendChild(document.createElement('td'));
        weaponCritStat.setAttribute('class', 'weapon-stat');
        weaponCritStat.textContent = distance.Multiplier + "×";
    });

    document.querySelector('#weapon-rpm-stat')
        .textContent = weapon.RoundsPerMinute ?? 600;

    document.querySelector('#weapon-ap-stat')
        .textContent = weapon.ArmorPenetration;

    document.querySelector('#weapon-mag-size-stat')
        .textContent = weapon.AmmoLoaded ?? 10;

    if (weapon.AmmoPickup.Min == weapon.AmmoPickup.Max)
        document.querySelector('#weapon-ammo-pickup-stat')
            .textContent = weapon.AmmoPickup.Max;
    else
        document.querySelector('#weapon-ammo-pickup-stat')
            .textContent = `${weapon.AmmoPickup.Min ?? 5}-${weapon.AmmoPickup.Max ?? 10}`;
}

const skills = {
    'edge': {
        name: 'Edge',
        description: 'You deal 10% extra damage for 20 seconds.',
        requiresEdge: false,
        damageMultiplier: 0.1
    },
    'longshot': {
        name: 'Long Shot',
        description: 'As long as you are aiming down sights distance penalties do not apply to headshot multipliers.',
        requiresEdge: true
    },
    'facetoface': {
        name: 'Face to Face',
        description: 'As long as you have both Edge and Grit you deal 10% extra damage to targets within 5 meters.',
        requiresEdge: true,
        damageMultiplier: 0.1
    },
    'coupdegrace': {
        name: 'Coup de Grâce',
        description: 'You deal 10% extra damage to staggered or stunned targets.',
        requiresEdge: true,
        damageMultiplier: 0.1
    },
    'combatmarking': {
        name: 'Combat Marking',
        description: 'You deal 20% extra damage to marked targets.',
        requiresEdge: true,
        damageMultiplier: 0.2
    },
    'painasymbolia': {
        name: 'Pain Asymbolia',
        description: 'The effects of Edge, Grit, and Rush are doubled.',
        requiresEdge: true,
        damageMultiplier: 0.1
    },
    'highgrain': {
        name: 'High Grain',
        description: 'After interacting with an ammo bag you and your teammates gain 0.2 AP.',
        requiresEdge: false,
        armorPenetrationModifier: 0.2
    },
    'Expose': {
        name: 'Expose',
        description: 'Enemies affected by your flashbang or shock grenade lose all armor while they are affected.',
        requiresEdge: false
    }
}

const edgeSkills = Object.keys(skills).filter(skill => skills[skill].requiresEdge);
console.log(edgeSkills);

initialiseWeaponData();

const skillButtons = document.querySelectorAll('button.weapon-skill');
const edgeSkillButtons = [...skillButtons].filter(skillButton => {
    return (edgeSkills.includes(skillButton.value));
});

// Initialise the damage chart with defaults
const weaponSelector = document.querySelector('#weapon-selector');
let selectedWeapon = weaponSelector.options[weaponSelector.selectedIndex].value,
    selectedSkills = [];

updateDamageData(selectedWeapon, selectedSkills);
updateWeaponStats(selectedWeapon);

// Add event listeners for weapon selector and buttons to update damage chart

weaponSelector.addEventListener("change", (event) => {
    selectedWeapon = event.target.options[event.target.selectedIndex].value;
    updateDamageData(selectedWeapon, selectedSkills);
    updateWeaponStats(selectedWeapon);
});

weaponSelector.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
});

for (const button of skillButtons) {
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (event.target.disabled) return;
        
        if (event.target.getAttribute('aria-pressed') == 'false') {
            event.target.setAttribute('aria-pressed', 'true');
        }
        else {
            event.target.setAttribute('aria-pressed', 'false');
        }

        if (event.target.value == 'edge') {
            if (event.target.getAttribute('aria-pressed') == 'true') {
                for (const edgeSkill of edgeSkillButtons) {
                    edgeSkill.removeAttribute('disabled');
                }
            }
            else {
                for (const edgeSkill of edgeSkillButtons) {
                    edgeSkill.setAttribute('disabled', '');
                    edgeSkill.setAttribute('aria-pressed', 'false');
                }
            }
        }

        const pressedButtons = Array.from(skillButtons)
            .filter(i => i.getAttribute('aria-pressed') == 'true')
            .map(i => i = i.value);
        selectedSkills = pressedButtons;

        updateDamageData(selectedWeapon, selectedSkills);
    });
}