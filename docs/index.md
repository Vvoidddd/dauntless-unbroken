---
title: Dauntless Unbroken
nav_order: 1
permalink: /
description: "Play, host and maintain Dauntless Unbroken. Launcher setup, server guides and technical documentation."
lang: en
ref: index
seo:
  type: WebPage
---

<div class="ub-hero">
  <div class="ub-hero-content">
    <span class="ub-eyebrow">DAUNTLESS UNBROKEN · DOCUMENTATION</span>
    <h1>Your next hunt starts here.</h1>
    <p>A fresh community realm for Dauntless 1.4.4. Find your way into the game, host a server, or explore how the services work.</p>
    <div class="ub-actions">
      <a class="btn btn-primary" href="https://github.com/Vvoidddd/dauntless-unbroken/releases/latest">Get the launcher ↗</a>
      <a class="btn" href="{{ '/setup/' | relative_url }}">Read the setup guide</a>
    </div>
  </div>
</div>

<div class="ub-facts"><span><strong>1.4.4</strong> Game client</span><span><strong>Windows + Linux</strong> Launcher</span><span><strong>Fresh realm</strong> New progression</span><span><strong>Open source</strong> AGPL-3.0</span></div>

## Choose your path

<div class="ub-cards">
  <a class="ub-card" href="{{ '/setup/' | relative_url }}"><span class="ub-step">01 / PLAY</span><span class="ub-card-title">Get into the game</span><p>Install the launcher, connect with a server invite and keep your account key safe.</p><span class="ub-card-link">Player setup →</span></a>
  <a class="ub-card" href="{{ '/setup/windows-server.html' | relative_url }}"><span class="ub-step">02 / HOST</span><span class="ub-card-title">Run your own realm</span><p>Deploy the Windows server kit, configure access and operate the game services.</p><span class="ub-card-link">Server setup →</span></a>
  <a class="ub-card" href="{{ '/reference/' | relative_url }}"><span class="ub-step">03 / UNDERSTAND</span><span class="ub-card-title">Know what runs where</span><p>Read the service architecture, configuration and account/progression reference.</p><span class="ub-card-link">Technical reference →</span></a>
</div>

## What is included

| Area | Features |
|:--|:--|
| **Launcher** | Purple interface, verified downloads, resume support, updates, settings and isolated offline saves. |
| **Accounts** | Personal account keys, saved progression, inventory, loadouts, friends and parties. |
| **The shop** | Weekly category rotation, Rams purchases and the once-per-account **Void** creator reward. |
| **Crafting** | Granny Strega crafting and Rams purchases, with normal progression requirements. |
| **Hunt hosting** | On-demand servers, fair waiting queues, CPU/RAM admission and empty-hunt cleanup. |
| **Operations** | Moderation tools, health monitoring, a Discord key bot and automated build checks. |

These are implemented features. Host availability, capacity and in-game verification are separate from a successful build. See the [roadmap]({{ '/roadmap.html' | relative_url }}) and [known issues]({{ '/setup/troubleshooting.html' | relative_url }}) for technical detail.

## Before you start

1. Use the **Unbroken launcher and invite together**. Its update feed and application data are separate from other realms.
2. A fresh realm means **new accounts and progression**. Old realm saves are not imported.
3. Keep your personal account key private. Offline play uses a separate local save.
4. Server operators should read the [configuration reference]({{ '/reference/configuration.html' | relative_url }}) before changing ports, keys or capacity limits.

<div class="ub-note"><strong>Independent community project.</strong> Dauntless Unbroken is not affiliated with Phoenix Labs or Epic Games. Game assets remain the property of their owners. This repository contains server and launcher source, not the retail game assets. <a href="{{ '/legal.html' | relative_url }}">Legal and license information →</a></div>
