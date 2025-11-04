if(Game.Objects.Farm.minigame) {
	Game.registerMod("sugarScum", {
		init: function() {
			// ========== GARDEN SCUM ==========
			
			class GardenScumUI {
				static reloadTickButton;
				static autoScumButton;
				static cancelScumButton;
				static seedsEnabled = true;
				static conflictingIDs = [];
				static selectedPlantsForMaxGrowth = [];
				static plantSelectionPanel;
				static plantSelectionButton;

				static DisplaySeeds() {
					if(GardenScum.scumming) return;
					
					// Clear display
					document.getElementById('possibleSeedsNextTick').innerHTML = '';
					
					const chances = NextTickMutations.GetPlantChances();
					
					if(Object.keys(chances).length === 0) {
						document.getElementById('possibleSeedsNextTick').insertAdjacentHTML('beforeend', `
							<div id="noSeed" class="gardenSeed" style="height: 50px;" onmouseover="Game.tooltip.wobble(); GardenScumUI.SeedTooltip(this, -1, 0);" onmouseout="Game.tooltip.shouldHide=1;">
								<div id="noSeedIcon" class="gardenSeedIcon shadowFilter" style="background:url(img/icons.png); background-position:0px -336px"; float: top"></div>
								<div id="seedLabel-${i}" style="text-align: center; margin-top: 40px;">Nothing</div>
							</div>`);
					} else {
						for(let i = 0; i < 34; i++) {
							const plant = garden.plantsById[i];
							
							if(chances[plant.key]) {
								const seedChance = (chances[plant.key] * 100).toFixed(2);
								document.getElementById('possibleSeedsNextTick').insertAdjacentHTML('beforeend', `
								<div id="possibleSeed-${i}" class="gardenSeed" style="height: 50px;" onmouseover="Game.tooltip.wobble(); GardenScumUI.SeedTooltip(this, ${i}, ${seedChance});" onmouseout="Game.tooltip.shouldHide=1;" onclick="GardenScumUI.SelectSeed(${i});">
									<div id="possibleSeedIcon-${i}" class="gardenSeedIcon shadowFilter" style="background-position: 0px ${plant.icon * -48}px; float: top"></div>
									<div id="seedLabel-${i}" style="text-align: center; margin-top: 40px;">${seedChance}%</div>
								</div>`);
							}
						}
						
						GardenScumUI.conflictingIDs = [];
						var seedsToRemove = [];
						for(let seed of GardenScum.selectedSeeds) {
							if(garden.plantsById[seed].key in chances) {
								if(GardenScumUI.conflictingIDs.includes(seed)) {
									seedsToRemove.push(seed);
									if(GardenScum.saveScumThisTick) GardenScum.StopAutoScum(4,0);
								} else {
									GardenScumUI.ReselectSeed(seed);
								}
							} else {
								seedsToRemove.push(seed);
								if(GardenScum.saveScumThisTick) GardenScum.StopAutoScum(1,0);
							}
						}
						
						if(seedsToRemove.length > 0) for(let seed of seedsToRemove) GardenScum.selectedSeeds.splice(GardenScum.selectedSeeds.indexOf(seed), 1);
						
						if(GardenScum.saveScumThisTick) GardenScumUI.ToggleSeeds(false);
					}
				}
				
				// Add the new panel to select plants
				static DisplayPlantSelection() {
					if (!GardenScumUI.plantSelectionPanel) {
						GardenScumUI.plantSelectionPanel = document.createElement("div");
						GardenScumUI.plantSelectionPanel.classList.add("gardenPanel");

						const panelContent = `
							<div class="title">Select Plants for Max Growth</div>
							<div id="plantSelectionList" style="display: flex; flex-direction: column; gap: 10px; padding: 10px;">
							</div>
							<div>
								<button id="startAutoScumButton">Start Auto-Scum</button>
							</div>
						`;

						GardenScumUI.plantSelectionPanel.innerHTML = panelContent;
						document.body.appendChild(GardenScumUI.plantSelectionPanel);
						document.getElementById("startAutoScumButton").addEventListener("click", GardenScumUI.StartAutoScumForSelectedPlants);
					}

					const plantSelectionList = document.getElementById("plantSelectionList");
					plantSelectionList.innerHTML = ''; // Clear previous selections

					garden.plantsById.forEach((plant, index) => {
						if (plant && plant.growing) {
							const plantDiv = document.createElement("div");
							plantDiv.classList.add("plantSelectionOption");
							plantDiv.innerHTML = `
								<input type="checkbox" id="selectPlant-${index}" />
								<label for="selectPlant-${index}">${plant.name} (Growth: ${plant.age})</label>
							`;
							plantSelectionList.appendChild(plantDiv);

							document.getElementById(`selectPlant-${index}`).addEventListener("change", (e) => {
								if (e.target.checked) {
									GardenScumUI.selectedPlantsForMaxGrowth.push(index);
								} else {
									const idx = GardenScumUI.selectedPlantsForMaxGrowth.indexOf(index);
									if (idx > -1) {
										GardenScumUI.selectedPlantsForMaxGrowth.splice(idx, 1);
									}
								}
							});
						}
					});
				}

				// Toggle visibility of the plant selection panel
				static TogglePlantSelectionPanel() {
					if (GardenScumUI.plantSelectionPanel.style.display === "none" || !GardenScumUI.plantSelectionPanel.style.display) {
						GardenScumUI.plantSelectionPanel.style.display = "block";
					} else {
						GardenScumUI.plantSelectionPanel.style.display = "none";
					}
				}

				// Start Auto-Scum for the selected plants
				static StartAutoScumForSelectedPlants() {
					if (GardenScumUI.selectedPlantsForMaxGrowth.length === 0) {
						Game.Notify("Please select at least one plant to scum!", "", [17,5]);
						return;
					}

					Game.Notify("Starting auto-scum for selected plants", "The game will reload until all selected plants reach their max growth.", [0, garden.plantsById[GardenScumUI.selectedPlantsForMaxGrowth[0]].icon, 'img/gardenPlants.png']);
					GardenScum.StartAutoScumForMaxGrowth();
				}

				// Existing methods for displaying and managing seeds...
			}

			// ========== GARDEN SCUM LOGIC ==========
			class GardenScum {
				static scumming = false;
				static selectedSeeds = [];

				static CheckMaxGrowth(plantID) {
					const plant = garden.plantsById[plantID];
					const maxGrowth = plant.mature;
					const currentGrowth = garden.plot[plant.position.y][plant.position.x][1]; // Assuming the growth level is stored here
					return currentGrowth >= maxGrowth;
				}

				static StartAutoScumForMaxGrowth() {
					GardenScum.scumming = true;

					async function scumLoop() {
						let attempts = 0;
						let prevPlots = {};

						// Track the plants before starting
						for (let plantID of GardenScumUI.selectedPlantsForMaxGrowth) {
							prevPlots[plantID] = GardenScum.PlotsWithPlant(plantID);
						}

						while (GardenScum.scumming) {
							attempts++;

							// Wait for the game to reload the tick
							await new Promise(resolve => {
								const check = setInterval(() => {
									if (garden) {
										clearInterval(check);
										resolve();
									}
								}, 50);
							});

							// Check if all selected plants have reached max growth
							let allPlantsMaxed = true;
							for (let plantID of GardenScumUI.selectedPlantsForMaxGrowth) {
								if (!GardenScum.CheckMaxGrowth(plantID)) {
									allPlantsMaxed = false;
									break;
								}
							}

							if (allPlantsMaxed) {
								GardenScum.StopAutoScum(0, attempts); // Stop once all selected plants have maxed out
								break;
							}

							// Reload the game tick to try again
							GardenScum.ReloadLastTick();
						}
					}

					// Start the loop
					scumLoop();
				}
			}

			// ========== INITIALIZATION ==========
			window.GardenScumUI = GardenScumUI;
			window.GardenScum = GardenScum;

			// Initialize UI and set up event listeners
			GardenScumUI.DisplayPlantSelection();
			document.getElementById('row2').insertAdjacentHTML('beforeend', `
				<div id="plantSelectionButton" class="productButton" onclick="GardenScumUI.TogglePlantSelectionPanel();">
					Select Plants for Max Growth
				</div>
			`);

			// Existing setup for the garden scum functionality
			GardenScumUI.Build();
			GardenScumUI.UpdateSaveCode();
			setInterval(GardenScum.CheckGarden, 100);
		}
	});
} else Game.Notify("Sugar Scum failed to load.", "You don't have a garden yet!", [17,5]);
