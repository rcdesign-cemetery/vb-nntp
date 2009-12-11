#!/usr/bin/perl

  use lib (
    '.',
    './lib',
  );

  use strict;
  use Wildev::AppServer::Core;
  use Wildev::AppServer::Toolkit;


  my $Toolkit = Wildev::AppServer::Toolkit->instance();
     $Toolkit->Config = './app.cnf';

     # to get settings from database we must force reload config here
     $Toolkit->Config->ForceReload();

  my $Server  = Wildev::AppServer::Core->new();
     $Server->run();

  exit 0;
