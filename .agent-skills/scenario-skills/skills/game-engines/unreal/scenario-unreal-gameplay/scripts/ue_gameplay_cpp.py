"""
ue_gameplay_cpp.py: C++ source templates for the scenario-unreal-gameplay skill (UE 5.8).

The expert shape (Forsythe VMZftEVDuCE): logic in a C++ base class, assets and cosmetics in
data-only Blueprint children whose defaults Python sets. Everything here is TEXT an agent can
write, diff and review. Tuning values are EditDefaultsOnly (Python-settable on the Blueprint
CDO), tests read state through BlueprintPure getters (Python calls them as methods), cosmetics
are BlueprintImplementableEvent hooks.

STATUS: NOT YET COMPILED. Unreal is not installed on 2026-09-24 and Xcode 26.6 is unlisted by
Epic (26.0 min, 26.1.1 recommended, 26.4 incompatible). API names marked [verify] in comments
are the ones most likely to have moved; compile once, then fix. The offline tests only check
structure (balanced braces, GENERATED_BODY, generated.h last, API macro, no em dashes).

Default numbers in these files (dash speed, radii, sight ranges) are PLACEHOLDERS to replace
with the feel targets the user gives; they are not expert numbers.

  import ue_gameplay_cpp as C
  files = C.scaffold("MyGame")                 # {relative path: text}
  files = C.scaffold("MyGame", features=("tags", "health", "character", "hero"))
"""
from __future__ import annotations

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24)

FEATURES = ("tags", "health", "character", "controller", "hero", "enemy", "dash", "melee",
            "ai", "statetree", "widget")

# Feature -> features it needs (scaffold() adds them).
REQUIRES = {
    "health": ("tags",),
    "character": ("tags", "health"),
    "controller": ("character",),
    "hero": ("character", "controller", "widget"),
    "enemy": ("character", "ai", "widget"),
    "dash": ("tags",),
    "melee": ("tags",),
    "ai": ("tags", "character"),
    "statetree": ("ai", "character"),
    "widget": ("character",),
}

# Modules the generated code links against (patch_build_cs adds the missing ones).
BUILD_MODULES = {
    "tags": ["GameplayTags"],
    "health": ["GameplayAbilities", "GameplayTags", "GameplayTasks", "NetCore"],
    "character": ["GameplayAbilities", "GameplayTags", "GameplayTasks"],
    "controller": ["GameplayAbilities"],
    "hero": ["EnhancedInput", "UMG"],
    "enemy": ["AIModule", "UMG"],
    "dash": ["GameplayAbilities", "GameplayTasks"],
    "melee": ["GameplayAbilities", "GameplayTasks"],
    "ai": ["AIModule", "NavigationSystem", "StateTreeModule", "GameplayStateTreeModule"],
    "statetree": ["StateTreeModule", "GameplayStateTreeModule", "AIModule", "NavigationSystem"],
    "widget": ["UMG", "Slate", "SlateCore"],
}

# Plugins the features need in the .uproject (identifiers; [verify] on the installed engine).
PLUGINS = {
    "health": ["GameplayAbilities"], "character": ["GameplayAbilities"],
    "dash": ["GameplayAbilities"], "melee": ["GameplayAbilities"],
    "ai": ["StateTree", "GameplayStateTree"], "statetree": ["StateTree", "GameplayStateTree"],
}

NATIVE_TAGS = [
    ("Ability.Dash", "Dash ability (asset tag, activation by tag)"),
    ("Ability.Attack.Melee", "Melee attack ability"),
    ("Cooldown.Ability.Dash", "Granted by the dash cooldown GE"),
    ("State.Dead", "Blocks abilities; set on death"),
    ("State.Stunned", "Blocks abilities"),
    ("Event.Attack.Hit", "Sent by AN_SendGameplayEvent on the montage hit frame"),
    ("Data.Damage", "SetByCaller magnitude for the shared damage GE"),
    ("AI.Event.TargetSeen", "StateTree event from perception"),
    ("AI.Event.TargetLost", "StateTree event from perception"),
]


def tag_symbol(tag):
    """'Cooldown.Ability.Dash' -> 'TAG_Cooldown_Ability_Dash'."""
    return "TAG_" + tag.replace(".", "_")


def _sub(text, module, api):
    return text.replace("@MODULE@", module).replace("@API@", api)


# ------------------------------------------------------------------------------------ tags
def _tags(module, api, tags):
    decl = "\n".join("%s UE_DECLARE_GAMEPLAY_TAG_EXTERN(%s);" % (api, tag_symbol(t))
                     for t, _c in tags)
    defs = "\n".join('UE_DEFINE_GAMEPLAY_TAG_COMMENT(%s, "%s", "%s");' % (tag_symbol(t), t, c)
                     for t, c in tags)
    h = """#pragma once
// Native gameplay tags (text, diffable, no ini round trip). Designer tags can still live in
// Config/DefaultGameplayTags.ini. NOT YET COMPILED.
#include "NativeGameplayTags.h"

%s
""" % decl
    cpp = """#include "Gameplay/GameplayNativeTags.h"

%s
""" % defs
    return {"Gameplay/GameplayNativeTags.h": h, "Gameplay/GameplayNativeTags.cpp": cpp}


# ---------------------------------------------------------------------------------- health
_HEALTH_H = r"""#pragma once
// Health attribute set. Attribute sets are C++ only (GAS doc; tranek 4.4). NOT YET COMPILED.
#include "CoreMinimal.h"
#include "AttributeSet.h"
#include "AbilitySystemComponent.h"
#include "GameplayHealthSet.generated.h"

// 5.6 ships ATTRIBUTE_ACCESSORS_BASIC (5.6 release notes); defined here for older engines.
#ifndef ATTRIBUTE_ACCESSORS_BASIC
#define ATTRIBUTE_ACCESSORS_BASIC(ClassName, PropertyName) \
	GAMEPLAYATTRIBUTE_PROPERTY_GETTER(ClassName, PropertyName) \
	GAMEPLAYATTRIBUTE_VALUE_GETTER(PropertyName) \
	GAMEPLAYATTRIBUTE_VALUE_SETTER(PropertyName) \
	GAMEPLAYATTRIBUTE_VALUE_INITTER(PropertyName)
#endif

UCLASS()
class @API@ UGameplayHealthSet : public UAttributeSet
{
	GENERATED_BODY()

public:
	UGameplayHealthSet();

	ATTRIBUTE_ACCESSORS_BASIC(UGameplayHealthSet, Health)
	ATTRIBUTE_ACCESSORS_BASIC(UGameplayHealthSet, MaxHealth)
	ATTRIBUTE_ACCESSORS_BASIC(UGameplayHealthSet, Damage)

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void PreAttributeChange(const FGameplayAttribute& Attribute, float& NewValue) override;
	virtual void PostGameplayEffectExecute(const FGameplayEffectModCallbackData& Data) override;

	UPROPERTY(BlueprintReadOnly, Category = "Health", ReplicatedUsing = OnRep_Health)
	FGameplayAttributeData Health;

	UPROPERTY(BlueprintReadOnly, Category = "Health", ReplicatedUsing = OnRep_MaxHealth)
	FGameplayAttributeData MaxHealth;

	// Meta attribute: written by the damage GE (SetByCaller Data.Damage), turned into Health
	// loss on the server, never replicated (Shao 8bi0rnXnRj4 [00:07:40]).
	UPROPERTY(BlueprintReadOnly, Category = "Health")
	FGameplayAttributeData Damage;

protected:
	UFUNCTION()
	void OnRep_Health(const FGameplayAttributeData& OldValue);

	UFUNCTION()
	void OnRep_MaxHealth(const FGameplayAttributeData& OldValue);
};
"""

_HEALTH_CPP = r"""#include "Gameplay/GameplayHealthSet.h"
#include "GameplayEffectExtension.h"
#include "Net/UnrealNetwork.h"

UGameplayHealthSet::UGameplayHealthSet()
{
	InitHealth(100.f);     // placeholder: the start value comes from an init GE or the data asset
	InitMaxHealth(100.f);
	InitDamage(0.f);
}

void UGameplayHealthSet::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME_CONDITION_NOTIFY(UGameplayHealthSet, Health, COND_None, REPNOTIFY_Always);
	DOREPLIFETIME_CONDITION_NOTIFY(UGameplayHealthSet, MaxHealth, COND_None, REPNOTIFY_Always);
}

void UGameplayHealthSet::PreAttributeChange(const FGameplayAttribute& Attribute, float& NewValue)
{
	Super::PreAttributeChange(Attribute, NewValue);
	if (Attribute == GetMaxHealthAttribute())
	{
		NewValue = FMath::Max(NewValue, 1.f);
	}
}

void UGameplayHealthSet::PostGameplayEffectExecute(const FGameplayEffectModCallbackData& Data)
{
	Super::PostGameplayEffectExecute(Data);
	if (Data.EvaluatedData.Attribute == GetDamageAttribute())
	{
		const float Amount = GetDamage();
		SetDamage(0.f);
		if (Amount > 0.f)
		{
			SetHealth(FMath::Clamp(GetHealth() - Amount, 0.f, GetMaxHealth()));
		}
	}
	else if (Data.EvaluatedData.Attribute == GetHealthAttribute())
	{
		SetHealth(FMath::Clamp(GetHealth(), 0.f, GetMaxHealth()));
	}
}

void UGameplayHealthSet::OnRep_Health(const FGameplayAttributeData& OldValue)
{
	GAMEPLAYATTRIBUTE_REPNOTIFY(UGameplayHealthSet, Health, OldValue);
}

void UGameplayHealthSet::OnRep_MaxHealth(const FGameplayAttributeData& OldValue)
{
	GAMEPLAYATTRIBUTE_REPNOTIFY(UGameplayHealthSet, MaxHealth, OldValue);
}
"""

# ------------------------------------------------------------------------------- character
_CHAR_H = r"""#pragma once
// Base for every character that uses GAS: ASC on the pawn (non-respawning or single player;
// move it to the PlayerState when attributes must survive respawn, tranek 4.1).
// Tests read state through the BlueprintPure getters (Python calls them as methods).
// NOT YET COMPILED.
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "AbilitySystemInterface.h"
#include "AbilitySystemComponent.h"
#include "GameplayCharacterBase.generated.h"

class UGameplayHealthSet;
class UGameplayAbility;
class UGameplayEffect;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FGameplayHealthChanged, float, Current, float, Max);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FGameplayCharacterDied, AGameplayCharacterBase*, Character);

UCLASS(Abstract)
class @API@ AGameplayCharacterBase : public ACharacter, public IAbilitySystemInterface
{
	GENERATED_BODY()

public:
	AGameplayCharacterBase();

	virtual UAbilitySystemComponent* GetAbilitySystemComponent() const override;
	virtual void PostInitializeComponents() override;
	virtual void PossessedBy(AController* NewController) override;
	virtual void BeginPlay() override;

	/** Owning-client ASC init for an ASC on the pawn. Called by AGameplayPlayerController::
	 *  AcknowledgePossession (tranek 4.1.2); the server side is PossessedBy. */
	void InitAbilityActorInfoOnOwningClient();

	UFUNCTION(BlueprintPure, Category = "Gameplay|Test")
	float GetHealth() const;

	UFUNCTION(BlueprintPure, Category = "Gameplay|Test")
	float GetMaxHealth() const;

	UFUNCTION(BlueprintPure, Category = "Gameplay|Test")
	bool HasGameplayTagByName(FName TagName) const;

	UFUNCTION(BlueprintPure, Category = "Gameplay|Test")
	bool IsDead() const;

	/** Patrol origin captured at BeginPlay; PatrolPoints are local to it. */
	FTransform GetPatrolOrigin() const { return PatrolOrigin; }

	UPROPERTY(BlueprintAssignable, Category = "Gameplay")
	FGameplayHealthChanged OnHealthChanged;

	UPROPERTY(BlueprintAssignable, Category = "Gameplay")
	FGameplayCharacterDied OnDied;

	/** Per placed instance (EditInstanceOnly), drawn as viewport gizmos (MakeEditWidget). */
	UPROPERTY(EditInstanceOnly, Category = "AI", meta = (MakeEditWidget = "true"))
	TArray<FVector> PatrolPoints;

	int32 PatrolIndex = 0;

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Abilities")
	TObjectPtr<UAbilitySystemComponent> AbilitySystem;

	UPROPERTY()
	TObjectPtr<UGameplayHealthSet> HealthSet;

	/** Mixed for player characters, Minimal for AI (Ratti via tranek 7.3). Set on the Blueprint CDO. */
	UPROPERTY(EditDefaultsOnly, Category = "Abilities")
	bool bMinimalReplication = false;

	UPROPERTY(EditDefaultsOnly, Category = "Abilities")
	TArray<TSubclassOf<UGameplayAbility>> DefaultAbilities;

	UPROPERTY(EditDefaultsOnly, Category = "Abilities")
	TArray<TSubclassOf<UGameplayEffect>> DefaultEffects;

	/** Cosmetic hook: C++ decides THAT it happens, the Blueprint decides WHICH effect (Forsythe [00:31:06]). */
	UFUNCTION(BlueprintImplementableEvent, Category = "Gameplay|Cosmetic")
	void OnDeathCosmetic();

	void InitAbilitySystem();
	void HandleHealthChanged(const FOnAttributeChangeData& Data);

	FTransform PatrolOrigin;
	bool bPatrolOriginSet = false;
	bool bDefaultsGiven = false;
};
"""

_CHAR_CPP = r"""#include "Gameplay/GameplayCharacterBase.h"
#include "Gameplay/GameplayHealthSet.h"
#include "Gameplay/GameplayNativeTags.h"
#include "Abilities/GameplayAbility.h"
#include "GameplayEffect.h"

AGameplayCharacterBase::AGameplayCharacterBase()
{
	// No gameplay code in constructors: they build the CDO at module load (Forsythe IaU2Hue-ApI [00:04:46]).
	PrimaryActorTick.bCanEverTick = false;   // nothing per frame here; CharacterMovement ticks itself
	AbilitySystem = CreateDefaultSubobject<UAbilitySystemComponent>(TEXT("AbilitySystem"));
	AbilitySystem->SetIsReplicated(true);
	HealthSet = CreateDefaultSubobject<UGameplayHealthSet>(TEXT("HealthSet"));
}

UAbilitySystemComponent* AGameplayCharacterBase::GetAbilitySystemComponent() const
{
	return AbilitySystem;
}

void AGameplayCharacterBase::PostInitializeComponents()
{
	Super::PostInitializeComponents();
	AbilitySystem->SetReplicationMode(bMinimalReplication ? EGameplayEffectReplicationMode::Minimal
	                                                      : EGameplayEffectReplicationMode::Mixed);
	AbilitySystem->GetGameplayAttributeValueChangeDelegate(UGameplayHealthSet::GetHealthAttribute())
		.AddUObject(this, &AGameplayCharacterBase::HandleHealthChanged);
}

void AGameplayCharacterBase::BeginPlay()
{
	Super::BeginPlay();
	// BeginPlay can run more than once under World Partition (Shao KBn62trwkLw [00:07:29]): keep it idempotent.
	if (!bPatrolOriginSet)
	{
		PatrolOrigin = GetActorTransform();
		bPatrolOriginSet = true;
	}
}

void AGameplayCharacterBase::PossessedBy(AController* NewController)
{
	Super::PossessedBy(NewController);
	InitAbilitySystem();   // server (and standalone) init; AI pawns need nothing else
}

void AGameplayCharacterBase::InitAbilityActorInfoOnOwningClient()
{
	// Without this, LocalPredicted abilities fail on clients with "Can't activate LocalOnly or
	// LocalPredicted ability ... when not local" (tranek 9.1). Harmless when it runs twice.
	if (AbilitySystem)
	{
		AbilitySystem->InitAbilityActorInfo(this, this);
	}
}

void AGameplayCharacterBase::InitAbilitySystem()
{
	AbilitySystem->InitAbilityActorInfo(this, this);
	if (!HasAuthority() || bDefaultsGiven)
	{
		return;
	}
	bDefaultsGiven = true;
	for (const TSubclassOf<UGameplayAbility>& AbilityClass : DefaultAbilities)
	{
		if (AbilityClass)
		{
			AbilitySystem->GiveAbility(FGameplayAbilitySpec(AbilityClass, 1, INDEX_NONE, this));
		}
	}
	for (const TSubclassOf<UGameplayEffect>& EffectClass : DefaultEffects)
	{
		if (!EffectClass)
		{
			continue;
		}
		FGameplayEffectContextHandle Context = AbilitySystem->MakeEffectContext();
		Context.AddSourceObject(this);
		const FGameplayEffectSpecHandle Spec = AbilitySystem->MakeOutgoingSpec(EffectClass, 1.f, Context);
		if (Spec.IsValid())
		{
			AbilitySystem->ApplyGameplayEffectSpecToSelf(*Spec.Data.Get());
		}
	}
}

void AGameplayCharacterBase::HandleHealthChanged(const FOnAttributeChangeData& Data)
{
	OnHealthChanged.Broadcast(Data.NewValue, GetMaxHealth());
	if (Data.NewValue <= 0.f && !IsDead())
	{
		// Loose tags do not replicate: in multiplayer grant State.Dead with a server GE instead.
		AbilitySystem->AddLooseGameplayTag(TAG_State_Dead);
		AbilitySystem->CancelAllAbilities();
		OnDied.Broadcast(this);
		OnDeathCosmetic();
	}
}

float AGameplayCharacterBase::GetHealth() const
{
	return HealthSet ? HealthSet->GetHealth() : 0.f;
}

float AGameplayCharacterBase::GetMaxHealth() const
{
	return HealthSet ? HealthSet->GetMaxHealth() : 0.f;
}

bool AGameplayCharacterBase::HasGameplayTagByName(FName TagName) const
{
	const FGameplayTag Tag = FGameplayTag::RequestGameplayTag(TagName, false);
	return Tag.IsValid() && AbilitySystem && AbilitySystem->HasMatchingGameplayTag(Tag);
}

bool AGameplayCharacterBase::IsDead() const
{
	return AbilitySystem && AbilitySystem->HasMatchingGameplayTag(TAG_State_Dead);
}
"""

# ------------------------------------------------------------------------------ controller
_PC_H = r"""#pragma once
// Player controller: owning-client init of a pawn-owned ASC. GAS needs InitAbilityActorInfo on
// BOTH sides after possession: server in the pawn's PossessedBy, owning client here
// (tranek 4.1.2). For an ASC on the PlayerState the client hook is OnRep_PlayerState instead.
// Set it as the GameMode's PlayerControllerClass (Python: player_controller_class).
// NOT YET COMPILED.
#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "GameplayPlayerController.generated.h"

UCLASS()
class @API@ AGameplayPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	virtual void AcknowledgePossession(APawn* P) override;
};
"""

_PC_CPP = r"""#include "Gameplay/GameplayPlayerController.h"
#include "Gameplay/GameplayCharacterBase.h"

void AGameplayPlayerController::AcknowledgePossession(APawn* P)
{
	Super::AcknowledgePossession(P);
	if (AGameplayCharacterBase* Character = Cast<AGameplayCharacterBase>(P))
	{
		Character->InitAbilityActorInfoOnOwningClient();   // server side: PossessedBy
	}
}
"""

# ------------------------------------------------------------------------------------ hero
_HERO_H = r"""#pragma once
// Player character: camera, Enhanced Input, abilities activated by tag, HUD widget.
// Input assets are EditDefaultsOnly slots filled on the Blueprint child from Python.
// NOT YET COMPILED.
#include "CoreMinimal.h"
#include "Gameplay/GameplayCharacterBase.h"
#include "GameplayTagContainer.h"
#include "InputActionValue.h"
#include "HeroCharacter.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UInputMappingContext;
class UInputAction;
class UHealthBarWidget;

UCLASS()
class @API@ AHeroCharacter : public AGameplayCharacterBase
{
	GENERATED_BODY()

public:
	AHeroCharacter();

protected:
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void NotifyControllerChanged() override;

	void Move(const FInputActionValue& Value);
	void Look(const FInputActionValue& Value);
	void Dash(const FInputActionValue& Value);
	void Attack(const FInputActionValue& Value);
	void CreateHud();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	TObjectPtr<USpringArmComponent> CameraBoom;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	TObjectPtr<UCameraComponent> FollowCamera;

	/** Soft reference, as the Enhanced Input doc recommends for contexts. */
	UPROPERTY(EditDefaultsOnly, Category = "Input")
	TSoftObjectPtr<UInputMappingContext> DefaultMappingContext;

	UPROPERTY(EditDefaultsOnly, Category = "Input")
	int32 MappingPriority = 0;

	UPROPERTY(EditDefaultsOnly, Category = "Input")
	TObjectPtr<UInputAction> MoveAction;

	UPROPERTY(EditDefaultsOnly, Category = "Input")
	TObjectPtr<UInputAction> LookAction;

	UPROPERTY(EditDefaultsOnly, Category = "Input")
	TObjectPtr<UInputAction> JumpAction;

	UPROPERTY(EditDefaultsOnly, Category = "Input")
	TObjectPtr<UInputAction> DashAction;

	UPROPERTY(EditDefaultsOnly, Category = "Input")
	TObjectPtr<UInputAction> AttackAction;

	UPROPERTY(EditDefaultsOnly, Category = "Abilities")
	FGameplayTag DashAbilityTag;

	UPROPERTY(EditDefaultsOnly, Category = "Abilities")
	FGameplayTag AttackAbilityTag;

	UPROPERTY(EditDefaultsOnly, Category = "UI")
	TSubclassOf<UHealthBarWidget> HudWidgetClass;

	UPROPERTY(Transient)
	TObjectPtr<UHealthBarWidget> HudWidget;
};
"""

_HERO_CPP = r"""#include "Gameplay/HeroCharacter.h"
#include "Gameplay/GameplayNativeTags.h"
#include "Gameplay/HealthBarWidget.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "Engine/LocalPlayer.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputMappingContext.h"
#include "Blueprint/UserWidget.h"

AHeroCharacter::AHeroCharacter()
{
	bUseControllerRotationYaw = false;
	GetCharacterMovement()->bOrientRotationToMovement = true;

	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(RootComponent);
	CameraBoom->bUsePawnControlRotation = true;

	FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	FollowCamera->bUsePawnControlRotation = false;

	DashAbilityTag = TAG_Ability_Dash;
	AttackAbilityTag = TAG_Ability_Attack_Melee;
}

void AHeroCharacter::NotifyControllerChanged()
{
	Super::NotifyControllerChanged();
	const APlayerController* PC = Cast<APlayerController>(Controller);
	if (!PC)
	{
		return;
	}
	if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
			ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
	{
		if (UInputMappingContext* Context = DefaultMappingContext.LoadSynchronous())
		{
			Subsystem->AddMappingContext(Context, MappingPriority);
		}
	}
	if (IsLocallyControlled())
	{
		CreateHud();
	}
}

void AHeroCharacter::CreateHud()
{
	// The widget is owned by the PlayerController (framework doc); created once per local pawn.
	APlayerController* PC = Cast<APlayerController>(Controller);
	if (!PC || HudWidget || !HudWidgetClass)
	{
		return;
	}
	HudWidget = CreateWidget<UHealthBarWidget>(PC, HudWidgetClass);
	if (HudWidget)
	{
		HudWidget->AddToViewport();
		HudWidget->BindToCharacter(this);
	}
}

void AHeroCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	UEnhancedInputComponent* Input = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!Input)
	{
		return;
	}
	if (JumpAction)
	{
		Input->BindAction(JumpAction, ETriggerEvent::Started, this, &ACharacter::Jump);
		Input->BindAction(JumpAction, ETriggerEvent::Completed, this, &ACharacter::StopJumping);
	}
	if (MoveAction)
	{
		Input->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AHeroCharacter::Move);
	}
	if (LookAction)
	{
		Input->BindAction(LookAction, ETriggerEvent::Triggered, this, &AHeroCharacter::Look);
	}
	if (DashAction)
	{
		Input->BindAction(DashAction, ETriggerEvent::Started, this, &AHeroCharacter::Dash);
	}
	if (AttackAction)
	{
		Input->BindAction(AttackAction, ETriggerEvent::Started, this, &AHeroCharacter::Attack);
	}
}

void AHeroCharacter::Move(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	if (!Controller)
	{
		return;
	}
	const FRotator YawRotation(0.f, Controller->GetControlRotation().Yaw, 0.f);
	AddMovementInput(FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X), Axis.Y);
	AddMovementInput(FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y), Axis.X);
}

void AHeroCharacter::Look(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	AddControllerYawInput(Axis.X);
	AddControllerPitchInput(Axis.Y);
}

void AHeroCharacter::Dash(const FInputActionValue& Value)
{
	if (AbilitySystem && DashAbilityTag.IsValid())
	{
		AbilitySystem->TryActivateAbilitiesByTag(FGameplayTagContainer(DashAbilityTag));
	}
}

void AHeroCharacter::Attack(const FInputActionValue& Value)
{
	if (AbilitySystem && AttackAbilityTag.IsValid())
	{
		AbilitySystem->TryActivateAbilitiesByTag(FGameplayTagContainer(AttackAbilityTag));
	}
}
"""

# ----------------------------------------------------------------------------------- enemy
_ENEMY_H = r"""#pragma once
// Enemy: Minimal ASC replication, AI controller class, overhead health bar.
// NOT YET COMPILED.
#include "CoreMinimal.h"
#include "Gameplay/GameplayCharacterBase.h"
#include "EnemyCharacter.generated.h"

class UWidgetComponent;
class UHealthBarWidget;

UCLASS()
class @API@ AEnemyCharacter : public AGameplayCharacterBase
{
	GENERATED_BODY()

public:
	AEnemyCharacter();
	virtual void BeginPlay() override;

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "UI")
	TObjectPtr<UWidgetComponent> OverheadWidget;
};
"""

_ENEMY_CPP = r"""#include "Gameplay/EnemyCharacter.h"
#include "Gameplay/EnemyAIController.h"
#include "Gameplay/HealthBarWidget.h"
#include "Components/WidgetComponent.h"

AEnemyCharacter::AEnemyCharacter()
{
	bMinimalReplication = true;   // AI: Minimal (Ratti via tranek 7.3)
	// C++ fallback only: the Blueprint child must point ai_controller_class at the controller
	// Blueprint that holds the StateTree asset, or placed and spawned enemies get a treeless
	// controller (AI docs, Agent translation). PlacedInWorldOrSpawned covers spawners too.
	AIControllerClass = AEnemyAIController::StaticClass();
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;

	OverheadWidget = CreateDefaultSubobject<UWidgetComponent>(TEXT("OverheadWidget"));
	OverheadWidget->SetupAttachment(RootComponent);
	OverheadWidget->SetWidgetSpace(EWidgetSpace::Screen);
	OverheadWidget->SetRelativeLocation(FVector(0.f, 0.f, 120.f));   // placeholder height
	OverheadWidget->SetDrawAtDesiredSize(true);
}

void AEnemyCharacter::BeginPlay()
{
	Super::BeginPlay();
	if (UHealthBarWidget* Bar = Cast<UHealthBarWidget>(OverheadWidget->GetUserWidgetObject()))
	{
		Bar->BindToCharacter(this);   // widget class is set on the Blueprint child (Widget Class)
	}
}
"""

# ------------------------------------------------------------------------------------ dash
_DASH_H = r"""#pragma once
// Dash with cooldown. The cooldown GE class is a Blueprint default (CooldownGameplayEffectClass)
// set from Python on the ability's Blueprint child. Distance is about DashSpeed * DashDuration.
// NOT YET COMPILED.
#include "CoreMinimal.h"
#include "Abilities/GameplayAbility.h"
#include "GA_Dash.generated.h"

UCLASS()
class @API@ UGA_Dash : public UGameplayAbility
{
	GENERATED_BODY()

public:
	UGA_Dash();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo, const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

protected:
	/** Horizontal speed during the dash, cm/s (placeholder; derive from the distance target). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Dash", meta = (ClampMin = "0"))
	float DashSpeed = 3000.f;

	/** Seconds (placeholder). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Dash", meta = (ClampMin = "0.01"))
	float DashDuration = 0.2f;

	/** Speed clamp when the dash ends, cm/s (placeholder). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Dash", meta = (ClampMin = "0"))
	float ExitSpeedClamp = 600.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Dash")
	bool bAllowInAir = true;

	UFUNCTION()
	void OnDashFinished();

	UFUNCTION(BlueprintImplementableEvent, Category = "Dash")
	void OnDashCosmetic(FVector Direction);
};
"""

_DASH_CPP = r"""#include "Gameplay/GA_Dash.h"
#include "Gameplay/GameplayNativeTags.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Abilities/Tasks/AbilityTask_ApplyRootMotionConstantForce.h"

UGA_Dash::UGA_Dash()
{
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;   // NonInstanced is deprecated (5.5)
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::LocalPredicted;

	FGameplayTagContainer AssetTagContainer;
	AssetTagContainer.AddTag(TAG_Ability_Dash);
	SetAssetTags(AssetTagContainer);   // 5.5+ accessor [verify]; older engines: AbilityTags = AssetTagContainer;
	ActivationBlockedTags.AddTag(TAG_State_Dead);
	ActivationBlockedTags.AddTag(TAG_State_Stunned);
}

void UGA_Dash::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo, const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	ACharacter* Character = ActorInfo ? Cast<ACharacter>(ActorInfo->AvatarActor.Get()) : nullptr;
	if (!Character || (!bAllowInAir && Character->GetCharacterMovement()->IsFalling()))
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}
	// Commit applies the cost and the cooldown GE; a cooldown GE must grant a tag (5.7 validation).
	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}
	FVector Direction = Character->GetLastMovementInputVector().GetSafeNormal2D();
	if (Direction.IsNearlyZero())
	{
		Direction = Character->GetActorForwardVector().GetSafeNormal2D();
	}
	OnDashCosmetic(Direction);

	// Root motion source: fixed distance, same on ground and in air, predicted by CharacterMovement [added].
	UAbilityTask_ApplyRootMotionConstantForce* Task =
		UAbilityTask_ApplyRootMotionConstantForce::ApplyRootMotionConstantForce(
			this, TEXT("Dash"), Direction, DashSpeed, DashDuration, /*bIsAdditive*/ false,
			/*StrengthOverTime*/ nullptr, ERootMotionFinishVelocityMode::ClampVelocity,
			FVector::ZeroVector, ExitSpeedClamp, /*bEnableGravity*/ false);   // signature [verify]
	if (!Task)
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}
	Task->OnFinish.AddDynamic(this, &UGA_Dash::OnDashFinished);
	Task->ReadyForActivation();
}

void UGA_Dash::OnDashFinished()
{
	// Always end, or the ability can never trigger again (Shao 8bi0rnXnRj4 [00:13:02]).
	EndAbility(CurrentSpecHandle, CurrentActorInfo, CurrentActivationInfo, true, false);
}
"""

# ----------------------------------------------------------------------------------- melee
_MELEE_H = r"""#pragma once
// Melee attack: montage plus a gameplay event on the hit frame (AN_SendGameplayEvent with an
// instance-editable tag, Shao 8bi0rnXnRj4 [00:10:46]), damage through ONE damage GE with a
// SetByCaller magnitude ([00:49:12]). Without a montage it hits at once (for tests before
// animation arrives). NOT YET COMPILED.
#include "CoreMinimal.h"
#include "Abilities/GameplayAbility.h"
#include "GA_MeleeAttack.generated.h"

class UAnimMontage;
class UGameplayEffect;

UCLASS()
class @API@ UGA_MeleeAttack : public UGameplayAbility
{
	GENERATED_BODY()

public:
	UGA_MeleeAttack();

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo, const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;

protected:
	UPROPERTY(EditDefaultsOnly, Category = "Melee")
	TObjectPtr<UAnimMontage> AttackMontage;

	UPROPERTY(EditDefaultsOnly, Category = "Melee")
	FGameplayTag HitEventTag;

	UPROPERTY(EditDefaultsOnly, Category = "Melee")
	FName HitSocket = TEXT("hand_r");   // placeholder socket name

	UPROPERTY(EditDefaultsOnly, Category = "Melee", meta = (ClampMin = "0"))
	float HitRadius = 60.f;             // placeholder, cm

	UPROPERTY(EditDefaultsOnly, Category = "Melee")
	TSubclassOf<UGameplayEffect> DamageEffect;

	UPROPERTY(EditDefaultsOnly, Category = "Melee", meta = (ClampMin = "0"))
	float Damage = 10.f;                // placeholder

	UPROPERTY(EditDefaultsOnly, Category = "Melee")
	FGameplayTag DamageSetByCallerTag;

	UFUNCTION()
	void OnHitEvent(FGameplayEventData Payload);

	UFUNCTION()
	void OnMontageFinished();

	void ApplyHit();
};
"""

_MELEE_CPP = r"""#include "Gameplay/GA_MeleeAttack.h"
#include "Gameplay/GameplayNativeTags.h"
#include "AbilitySystemBlueprintLibrary.h"
#include "AbilitySystemComponent.h"
#include "Abilities/Tasks/AbilityTask_PlayMontageAndWait.h"
#include "Abilities/Tasks/AbilityTask_WaitGameplayEvent.h"
#include "GameFramework/Character.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/OverlapResult.h"
#include "Engine/World.h"

UGA_MeleeAttack::UGA_MeleeAttack()
{
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::LocalPredicted;
	FGameplayTagContainer AssetTagContainer;
	AssetTagContainer.AddTag(TAG_Ability_Attack_Melee);
	SetAssetTags(AssetTagContainer);   // [verify] as in UGA_Dash
	ActivationBlockedTags.AddTag(TAG_State_Dead);
	ActivationBlockedTags.AddTag(TAG_State_Stunned);
	HitEventTag = TAG_Event_Attack_Hit;
	DamageSetByCallerTag = TAG_Data_Damage;
}

void UGA_MeleeAttack::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo, const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}
	if (!AttackMontage)
	{
		ApplyHit();
		EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		return;
	}
	UAbilityTask_WaitGameplayEvent* WaitHit =
		UAbilityTask_WaitGameplayEvent::WaitGameplayEvent(this, HitEventTag, nullptr, true, true);
	WaitHit->EventReceived.AddDynamic(this, &UGA_MeleeAttack::OnHitEvent);
	WaitHit->ReadyForActivation();

	// PlayMontageAndWait, not PlayMontage: it replicates and ends with the ability (tranek 9.3).
	UAbilityTask_PlayMontageAndWait* Play =
		UAbilityTask_PlayMontageAndWait::CreatePlayMontageAndWaitProxy(this, NAME_None, AttackMontage);
	Play->OnCompleted.AddDynamic(this, &UGA_MeleeAttack::OnMontageFinished);
	Play->OnBlendOut.AddDynamic(this, &UGA_MeleeAttack::OnMontageFinished);
	Play->OnInterrupted.AddDynamic(this, &UGA_MeleeAttack::OnMontageFinished);
	Play->OnCancelled.AddDynamic(this, &UGA_MeleeAttack::OnMontageFinished);
	Play->ReadyForActivation();
}

void UGA_MeleeAttack::OnHitEvent(FGameplayEventData Payload)
{
	ApplyHit();
}

void UGA_MeleeAttack::ApplyHit()
{
	if (!HasAuthority(&CurrentActivationInfo) || !DamageEffect)
	{
		return;   // damage is never predicted (tranek 4.10)
	}
	ACharacter* Avatar = Cast<ACharacter>(GetAvatarActorFromActorInfo());
	if (!Avatar)
	{
		return;
	}
	FVector Center = Avatar->GetActorLocation() + Avatar->GetActorForwardVector() * HitRadius;
	if (Avatar->GetMesh() && Avatar->GetMesh()->DoesSocketExist(HitSocket))
	{
		Center = Avatar->GetMesh()->GetSocketLocation(HitSocket);
	}
	TArray<FOverlapResult> Overlaps;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(MeleeHit), false, Avatar);
	Avatar->GetWorld()->OverlapMultiByObjectType(Overlaps, Center, FQuat::Identity,
		FCollisionObjectQueryParams(ECC_Pawn), FCollisionShape::MakeSphere(HitRadius), Params);

	TSet<AActor*> Hit;
	UAbilitySystemComponent* SourceASC = GetAbilitySystemComponentFromActorInfo();
	for (const FOverlapResult& Overlap : Overlaps)
	{
		AActor* Target = Overlap.GetActor();
		if (!Target || Hit.Contains(Target))
		{
			continue;
		}
		Hit.Add(Target);
		UAbilitySystemComponent* TargetASC = UAbilitySystemBlueprintLibrary::GetAbilitySystemComponent(Target);
		if (!TargetASC || !SourceASC)
		{
			continue;
		}
		FGameplayEffectSpecHandle Spec = MakeOutgoingGameplayEffectSpec(DamageEffect, GetAbilityLevel());
		if (Spec.IsValid())
		{
			Spec.Data->SetSetByCallerMagnitude(DamageSetByCallerTag, Damage);
			SourceASC->ApplyGameplayEffectSpecToTarget(*Spec.Data.Get(), TargetASC);
		}
	}
}

void UGA_MeleeAttack::OnMontageFinished()
{
	EndAbility(CurrentSpecHandle, CurrentActorInfo, CurrentActivationInfo, true, false);
}
"""

# -------------------------------------------------------------------------------------- ai
_AI_H = r"""#pragma once
// Enemy controller: StateTree AI component (5.4) plus sight perception that sends StateTree
// events (events are the cheapest transitions, Mononen YEmq4kcblj4 [00:15:01]).
// DebugStateName is written by FSTTask_SetDebugState so Python tests can read the state.
// NOT YET COMPILED.
#include "CoreMinimal.h"
#include "AIController.h"
#include "Perception/AIPerceptionTypes.h"
#include "EnemyAIController.generated.h"

class UStateTreeAIComponent;
class UAIPerceptionComponent;
class UAISenseConfig_Sight;
class AGameplayCharacterBase;

UCLASS()
class @API@ AEnemyAIController : public AAIController
{
	GENERATED_BODY()

public:
	AEnemyAIController();

	UFUNCTION(BlueprintCallable, Category = "AI|Debug")
	void SetDebugStateName(FName InName);

	UPROPERTY(BlueprintReadOnly, Category = "AI")
	TObjectPtr<AActor> TargetActor;

	UPROPERTY(BlueprintReadOnly, Category = "AI|Debug")
	FName DebugStateName;

protected:
	virtual void BeginPlay() override;
	virtual void OnPossess(APawn* InPawn) override;
	virtual void OnUnPossess() override;

	UFUNCTION()
	void OnTargetPerceptionUpdated(AActor* Actor, FAIStimulus Stimulus);

	/** Bound to the pawn's OnDied: the pawn never knows who listens (Forsythe VMZftEVDuCE [00:19:25]). */
	UFUNCTION()
	void HandlePawnDied(AGameplayCharacterBase* DeadCharacter);

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "AI")
	TObjectPtr<UStateTreeAIComponent> StateTreeComponent;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "AI")
	TObjectPtr<UAIPerceptionComponent> Perception;

	UPROPERTY(VisibleAnywhere, Category = "AI")
	TObjectPtr<UAISenseConfig_Sight> SightConfig;

	/** Placeholders: set per enemy type on the Blueprint child. */
	UPROPERTY(EditDefaultsOnly, Category = "AI|Sight", meta = (ClampMin = "0"))
	float SightRadius = 1500.f;

	UPROPERTY(EditDefaultsOnly, Category = "AI|Sight", meta = (ClampMin = "0"))
	float LoseSightRadius = 1800.f;

	UPROPERTY(EditDefaultsOnly, Category = "AI|Sight", meta = (ClampMin = "0", ClampMax = "180"))
	float PeripheralVisionHalfAngle = 70.f;

	UPROPERTY(EditDefaultsOnly, Category = "AI|Sight", meta = (ClampMin = "0"))
	float SightMaxAge = 5.f;
};
"""

_AI_CPP = r"""#include "Gameplay/EnemyAIController.h"
#include "Gameplay/GameplayCharacterBase.h"
#include "Gameplay/GameplayNativeTags.h"
#include "Components/StateTreeAIComponent.h"
#include "Perception/AIPerceptionComponent.h"
#include "Perception/AISenseConfig_Sight.h"
#include "Kismet/GameplayStatics.h"

AEnemyAIController::AEnemyAIController()
{
	StateTreeComponent = CreateDefaultSubobject<UStateTreeAIComponent>(TEXT("StateTree"));
	StateTreeComponent->SetStartLogicAutomatically(false);   // start on possess, not at BeginPlay [verify]

	Perception = CreateDefaultSubobject<UAIPerceptionComponent>(TEXT("Perception"));
	SightConfig = CreateDefaultSubobject<UAISenseConfig_Sight>(TEXT("SightConfig"));
	SightConfig->DetectionByAffiliation.bDetectEnemies = true;
	SightConfig->DetectionByAffiliation.bDetectNeutrals = true;   // no team interface yet: everyone is neutral
	SightConfig->DetectionByAffiliation.bDetectFriendlies = false;
	Perception->ConfigureSense(*SightConfig);
	Perception->SetDominantSense(SightConfig->GetSenseImplementation());
	SetPerceptionComponent(*Perception);
}

void AEnemyAIController::BeginPlay()
{
	Super::BeginPlay();
	// Apply the Blueprint-child values (constructors run before class defaults are known).
	SightConfig->SightRadius = SightRadius;
	SightConfig->LoseSightRadius = FMath::Max(LoseSightRadius, SightRadius);
	SightConfig->PeripheralVisionAngleDegrees = PeripheralVisionHalfAngle;
	SightConfig->SetMaxAge(SightMaxAge);
	Perception->ConfigureSense(*SightConfig);
	Perception->OnTargetPerceptionUpdated.AddUniqueDynamic(this, &AEnemyAIController::OnTargetPerceptionUpdated);
}

void AEnemyAIController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);
	// One-way dependency: the pawn broadcasts OnDied; this controller, a spawner, the HUD or a
	// score system bind to it (Forsythe VMZftEVDuCE [00:19:25]; BP docs, Communication).
	if (AGameplayCharacterBase* Character = Cast<AGameplayCharacterBase>(InPawn))
	{
		Character->OnDied.AddUniqueDynamic(this, &AEnemyAIController::HandlePawnDied);
	}
	StateTreeComponent->StartLogic();
}

void AEnemyAIController::OnUnPossess()
{
	if (AGameplayCharacterBase* Character = Cast<AGameplayCharacterBase>(GetPawn()))
	{
		Character->OnDied.RemoveDynamic(this, &AEnemyAIController::HandlePawnDied);
	}
	Super::OnUnPossess();
}

void AEnemyAIController::HandlePawnDied(AGameplayCharacterBase* DeadCharacter)
{
	StateTreeComponent->StopLogic(TEXT("Died"));   // no zombie behavior after death
	TargetActor = nullptr;
	SetDebugStateName(TEXT("Dead"));
	const double Now = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
	UE_LOG(LogTemp, Log, TEXT("GAMEPLAY_TRACE {\"kind\":\"state\",\"actor\":\"%s\",\"state\":\"Dead\",\"t\":%.3f}"),
		DeadCharacter ? *DeadCharacter->GetName() : TEXT("None"), Now);
}

void AEnemyAIController::OnTargetPerceptionUpdated(AActor* Actor, FAIStimulus Stimulus)
{
	if (!Actor || Actor != UGameplayStatics::GetPlayerPawn(this, 0))
	{
		return;
	}
	if (Stimulus.WasSuccessfullySensed())
	{
		TargetActor = Actor;
		StateTreeComponent->SendStateTreeEvent(FStateTreeEvent(TAG_AI_Event_TargetSeen));
	}
	else if (Actor == TargetActor)
	{
		StateTreeComponent->SendStateTreeEvent(FStateTreeEvent(TAG_AI_Event_TargetLost));
		TargetActor = nullptr;
	}
}

void AEnemyAIController::SetDebugStateName(FName InName)
{
	DebugStateName = InName;
}
"""

# ------------------------------------------------------------------------------- statetree
_ST_H = r"""#pragma once
// StateTree tasks. Logic as text; the tree only wires them (Mononen: C++ for runtime
// efficiency, Blueprint tasks for iteration [00:28:05]). Property categories define binding
// usage: Context (auto-bound), Input (must bind), Output (written by code), Parameter.
// On 5.6+ set Task Control Flow so helper tasks do not complete the state.
// NOT YET COMPILED; base class and signatures [verify] on 5.8.
#include "CoreMinimal.h"
#include "StateTreeTaskBase.h"
#include "StateTreeExecutionContext.h"
#include "GameplayTagContainer.h"
#include "GameplayStateTreeTasks.generated.h"

class AAIController;

USTRUCT()
struct @API@ FSTFindPatrolPointData
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, Category = "Context")
	TObjectPtr<AAIController> AIController = nullptr;

	/** Used when the pawn has no PatrolPoints: random reachable point in this radius (cm). */
	UPROPERTY(EditAnywhere, Category = "Parameter")
	float SearchRadius = 800.f;

	UPROPERTY(EditAnywhere, Category = "Output")
	FVector PatrolLocation = FVector::ZeroVector;
};

/** Writes the next patrol point; stays Running so the MoveTo task decides completion. */
USTRUCT(meta = (DisplayName = "Find Patrol Point", Category = "Gameplay"))
struct @API@ FSTTask_FindPatrolPoint : public FStateTreeTaskCommonBase
{
	GENERATED_BODY()
	using FInstanceDataType = FSTFindPatrolPointData;
	virtual const UStruct* GetInstanceDataType() const override { return FInstanceDataType::StaticStruct(); }
	virtual EStateTreeRunStatus EnterState(FStateTreeExecutionContext& Context,
		const FStateTreeTransitionResult& Transition) const override;
};

USTRUCT()
struct @API@ FSTActivateAbilityData
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, Category = "Context")
	TObjectPtr<AAIController> AIController = nullptr;

	UPROPERTY(EditAnywhere, Category = "Parameter")
	FGameplayTag AbilityTag;

	/** Every task gets a timeout so rhythm can come from designers (Bruno XKQfMZOXFv0 [00:19:15]). */
	UPROPERTY(EditAnywhere, Category = "Parameter", meta = (ClampMin = "0.1"))
	float TimeoutSeconds = 3.f;

	float Elapsed = 0.f;
};

/** Behavior chooses, the ability acts (Bruno [00:17:37]): succeeds when the ability ends. */
USTRUCT(meta = (DisplayName = "Activate Ability By Tag", Category = "Gameplay"))
struct @API@ FSTTask_ActivateAbilityByTag : public FStateTreeTaskCommonBase
{
	GENERATED_BODY()
	using FInstanceDataType = FSTActivateAbilityData;
	virtual const UStruct* GetInstanceDataType() const override { return FInstanceDataType::StaticStruct(); }
	virtual EStateTreeRunStatus EnterState(FStateTreeExecutionContext& Context,
		const FStateTreeTransitionResult& Transition) const override;
	virtual EStateTreeRunStatus Tick(FStateTreeExecutionContext& Context, const float DeltaTime) const override;
	virtual void ExitState(FStateTreeExecutionContext& Context,
		const FStateTreeTransitionResult& Transition) const override;
};

USTRUCT()
struct @API@ FSTSetDebugStateData
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, Category = "Context")
	TObjectPtr<AAIController> AIController = nullptr;

	UPROPERTY(EditAnywhere, Category = "Parameter")
	FName StateName;
};

/** Test hook: writes the state name to the controller and a GAMEPLAY_TRACE log line. */
USTRUCT(meta = (DisplayName = "Set Debug State", Category = "Gameplay|Debug"))
struct @API@ FSTTask_SetDebugState : public FStateTreeTaskCommonBase
{
	GENERATED_BODY()
	using FInstanceDataType = FSTSetDebugStateData;
	virtual const UStruct* GetInstanceDataType() const override { return FInstanceDataType::StaticStruct(); }
	virtual EStateTreeRunStatus EnterState(FStateTreeExecutionContext& Context,
		const FStateTreeTransitionResult& Transition) const override;
};
"""

_ST_CPP = r"""#include "Gameplay/GameplayStateTreeTasks.h"
#include "Gameplay/GameplayCharacterBase.h"
#include "Gameplay/EnemyAIController.h"
#include "AIController.h"
#include "AbilitySystemBlueprintLibrary.h"
#include "AbilitySystemComponent.h"
#include "NavigationSystem.h"

EStateTreeRunStatus FSTTask_FindPatrolPoint::EnterState(FStateTreeExecutionContext& Context,
	const FStateTreeTransitionResult& Transition) const
{
	FInstanceDataType& Data = Context.GetInstanceData(*this);
	APawn* Pawn = Data.AIController ? Data.AIController->GetPawn() : nullptr;
	if (!Pawn)
	{
		return EStateTreeRunStatus::Failed;
	}
	if (AGameplayCharacterBase* Character = Cast<AGameplayCharacterBase>(Pawn))
	{
		if (Character->PatrolPoints.Num() > 0)
		{
			const int32 Index = Character->PatrolIndex % Character->PatrolPoints.Num();
			Data.PatrolLocation = Character->GetPatrolOrigin().TransformPosition(Character->PatrolPoints[Index]);
			Character->PatrolIndex = Index + 1;
			return EStateTreeRunStatus::Running;
		}
	}
	FNavLocation Out;
	UNavigationSystemV1* Nav = FNavigationSystem::GetCurrent<UNavigationSystemV1>(Pawn->GetWorld());
	if (Nav && Nav->GetRandomReachablePointInRadius(Pawn->GetActorLocation(), Data.SearchRadius, Out))
	{
		Data.PatrolLocation = Out.Location;
		return EStateTreeRunStatus::Running;
	}
	return EStateTreeRunStatus::Failed;   // failure must have an explicit transition (Mononen [00:06:04])
}

static UAbilitySystemComponent* STGetASC(const AAIController* Controller)
{
	return Controller ? UAbilitySystemBlueprintLibrary::GetAbilitySystemComponent(Controller->GetPawn()) : nullptr;
}

static bool STAbilityActive(UAbilitySystemComponent* ASC, const FGameplayTag& Tag)
{
	TArray<FGameplayAbilitySpec*> Specs;
	ASC->GetActivatableGameplayAbilitySpecsByAllMatchingTags(FGameplayTagContainer(Tag), Specs, false);
	for (const FGameplayAbilitySpec* Spec : Specs)
	{
		if (Spec && Spec->IsActive())
		{
			return true;
		}
	}
	return false;
}

EStateTreeRunStatus FSTTask_ActivateAbilityByTag::EnterState(FStateTreeExecutionContext& Context,
	const FStateTreeTransitionResult& Transition) const
{
	FInstanceDataType& Data = Context.GetInstanceData(*this);
	Data.Elapsed = 0.f;
	UAbilitySystemComponent* ASC = STGetASC(Data.AIController);
	if (!ASC || !Data.AbilityTag.IsValid())
	{
		return EStateTreeRunStatus::Failed;
	}
	return ASC->TryActivateAbilitiesByTag(FGameplayTagContainer(Data.AbilityTag))
		? EStateTreeRunStatus::Running : EStateTreeRunStatus::Failed;
}

EStateTreeRunStatus FSTTask_ActivateAbilityByTag::Tick(FStateTreeExecutionContext& Context, const float DeltaTime) const
{
	FInstanceDataType& Data = Context.GetInstanceData(*this);
	UAbilitySystemComponent* ASC = STGetASC(Data.AIController);
	if (!ASC)
	{
		return EStateTreeRunStatus::Failed;
	}
	Data.Elapsed += DeltaTime;
	if (Data.Elapsed >= Data.TimeoutSeconds)
	{
		const FGameplayTagContainer Tags(Data.AbilityTag);
		ASC->CancelAbilities(&Tags);
		return EStateTreeRunStatus::Failed;
	}
	return STAbilityActive(ASC, Data.AbilityTag) ? EStateTreeRunStatus::Running : EStateTreeRunStatus::Succeeded;
}

void FSTTask_ActivateAbilityByTag::ExitState(FStateTreeExecutionContext& Context,
	const FStateTreeTransitionResult& Transition) const
{
	// The behavior left the state: the task ends and cancels the ability (Bruno [00:18:41]).
	FInstanceDataType& Data = Context.GetInstanceData(*this);
	if (UAbilitySystemComponent* ASC = STGetASC(Data.AIController))
	{
		if (STAbilityActive(ASC, Data.AbilityTag))
		{
			const FGameplayTagContainer Tags(Data.AbilityTag);
			ASC->CancelAbilities(&Tags);
		}
	}
}

EStateTreeRunStatus FSTTask_SetDebugState::EnterState(FStateTreeExecutionContext& Context,
	const FStateTreeTransitionResult& Transition) const
{
	FInstanceDataType& Data = Context.GetInstanceData(*this);
	if (AEnemyAIController* Enemy = Cast<AEnemyAIController>(Data.AIController))
	{
		Enemy->SetDebugStateName(Data.StateName);
	}
	const AActor* Owner = Data.AIController ? Data.AIController->GetPawn() : nullptr;
	const double Now = Owner && Owner->GetWorld() ? Owner->GetWorld()->GetTimeSeconds() : 0.0;
	UE_LOG(LogTemp, Log, TEXT("GAMEPLAY_TRACE {\"kind\":\"state\",\"actor\":\"%s\",\"state\":\"%s\",\"t\":%.3f}"),
		Owner ? *Owner->GetName() : TEXT("None"), *Data.StateName.ToString(), Now);
	return EStateTreeRunStatus::Running;
}
"""

# ---------------------------------------------------------------------------------- widget
_WIDGET_H = r"""#pragma once
// Health bar: BindWidget members (the Widget Blueprint tree is built from Python with
// EditorUtilityLibrary.add_source_widget using the same names), event-driven updates,
// no property bindings, no Tick (Albert VxX1aah6TZM [00:24:09]). NOT YET COMPILED.
#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "HealthBarWidget.generated.h"

class UProgressBar;
class UTextBlock;
class AGameplayCharacterBase;

UCLASS(Abstract)
class @API@ UHealthBarWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "Health")
	void SetHealth(float Current, float Max);

	UFUNCTION(BlueprintCallable, Category = "Health")
	void BindToCharacter(AGameplayCharacterBase* Character);

	UFUNCTION(BlueprintPure, Category = "Health|Test")
	float GetDisplayedPercent() const;

protected:
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UProgressBar> HealthBar;

	UPROPERTY(meta = (BindWidgetOptional))
	TObjectPtr<UTextBlock> HealthText;

	/** Enemy bars: hide at full health. Hidden only repaints; Collapsed changes layout (Albert [00:12:53]). */
	UPROPERTY(EditAnywhere, Category = "Health")
	bool bHideWhenFull = false;

	UFUNCTION()
	void HandleHealthChanged(float Current, float Max);

	int32 LastShownValue = INDEX_NONE;
	float DisplayedPercent = 1.f;
};
"""

_WIDGET_CPP = r"""#include "Gameplay/HealthBarWidget.h"
#include "Gameplay/GameplayCharacterBase.h"
#include "Components/ProgressBar.h"
#include "Components/TextBlock.h"

void UHealthBarWidget::SetHealth(float Current, float Max)
{
	DisplayedPercent = Max > 0.f ? FMath::Clamp(Current / Max, 0.f, 1.f) : 0.f;
	if (HealthBar)
	{
		HealthBar->SetPercent(DisplayedPercent);
	}
	// A text change is a layout invalidation (Albert [00:13:56]): only when the shown number changes.
	const int32 Shown = FMath::CeilToInt(Current);
	if (HealthText && Shown != LastShownValue)
	{
		LastShownValue = Shown;
		HealthText->SetText(FText::AsNumber(Shown));
	}
	if (bHideWhenFull)
	{
		SetVisibility(DisplayedPercent >= 1.f ? ESlateVisibility::Hidden : ESlateVisibility::HitTestInvisible);
	}
}

void UHealthBarWidget::BindToCharacter(AGameplayCharacterBase* Character)
{
	if (!Character)
	{
		return;
	}
	Character->OnHealthChanged.AddUniqueDynamic(this, &UHealthBarWidget::HandleHealthChanged);
	SetHealth(Character->GetHealth(), Character->GetMaxHealth());
}

void UHealthBarWidget::HandleHealthChanged(float Current, float Max)
{
	SetHealth(Current, Max);
}

float UHealthBarWidget::GetDisplayedPercent() const
{
	return DisplayedPercent;
}
"""

_FILES = {
    "health": {"Gameplay/GameplayHealthSet.h": _HEALTH_H, "Gameplay/GameplayHealthSet.cpp": _HEALTH_CPP},
    "character": {"Gameplay/GameplayCharacterBase.h": _CHAR_H,
                  "Gameplay/GameplayCharacterBase.cpp": _CHAR_CPP},
    "controller": {"Gameplay/GameplayPlayerController.h": _PC_H,
                   "Gameplay/GameplayPlayerController.cpp": _PC_CPP},
    "hero": {"Gameplay/HeroCharacter.h": _HERO_H, "Gameplay/HeroCharacter.cpp": _HERO_CPP},
    "enemy": {"Gameplay/EnemyCharacter.h": _ENEMY_H, "Gameplay/EnemyCharacter.cpp": _ENEMY_CPP},
    "dash": {"Gameplay/GA_Dash.h": _DASH_H, "Gameplay/GA_Dash.cpp": _DASH_CPP},
    "melee": {"Gameplay/GA_MeleeAttack.h": _MELEE_H, "Gameplay/GA_MeleeAttack.cpp": _MELEE_CPP},
    "ai": {"Gameplay/EnemyAIController.h": _AI_H, "Gameplay/EnemyAIController.cpp": _AI_CPP},
    "statetree": {"Gameplay/GameplayStateTreeTasks.h": _ST_H,
                  "Gameplay/GameplayStateTreeTasks.cpp": _ST_CPP},
    "widget": {"Gameplay/HealthBarWidget.h": _WIDGET_H, "Gameplay/HealthBarWidget.cpp": _WIDGET_CPP},
}


def resolve_features(features):
    """Add the features each requested feature needs, in a stable order."""
    want = set()
    stack = list(features)
    while stack:
        f = stack.pop()
        if f not in FEATURES:
            raise ValueError("unknown feature %r (known: %s)" % (f, ", ".join(FEATURES)))
        if f in want:
            continue
        want.add(f)
        stack.extend(REQUIRES.get(f, ()))
    return [f for f in FEATURES if f in want]


def scaffold(module, features=FEATURES, api=None, tags=None):
    """Return {path relative to Source/<module>/: text} for the requested features.

    module: the game module name (folder under Source/, also the API macro stem).
    api: override the export macro (default MODULE_API upper-case)."""
    if not module or not module.replace("_", "").isalnum():
        raise ValueError("module must be an identifier, got %r" % module)
    api = api or (module.upper() + "_API")
    feats = resolve_features(features)
    out = {}
    out.update(_tags(module, api, tags or NATIVE_TAGS))
    for f in feats:
        for rel, text in _FILES.get(f, {}).items():
            out[rel] = _sub(text, module, api)
    return out


def modules_for(features):
    mods = []
    for f in resolve_features(features):
        for m in BUILD_MODULES.get(f, []):
            if m not in mods:
                mods.append(m)
    return mods


def plugins_for(features):
    plugs = []
    for f in resolve_features(features):
        for p in PLUGINS.get(f, []):
            if p not in plugs:
                plugs.append(p)
    return plugs
